import { beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import db from '../../models/index.js';
import {
  createMailService,
  EmailDisabledError,
  isTransientEmailError
} from '../../services/email/emailService.js';

const { EmailDelivery, User, sequelize } = db;
const NOW = new Date('2026-09-02T08:00:00.000Z');

const uniqueValue = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = (overrides = {}) => {
  const username = uniqueValue('email-service-user');
  return User.create({
    username,
    email: `${uniqueValue('email')}@example.com`,
    password: 'stored-password',
    feverCredentialHash: uniqueValue('email-service-fever'),
    role: 'user',
    ...overrides
  });
};

const enabledConfiguration = ({ pool = false } = {}) => {
  const auth = { user: 'smtp-user' };
  Object.defineProperty(auth, 'pass', {
    value: 'smtp-password',
    enumerable: false
  });
  return {
    enabled: true,
    publicAppUrl: 'https://rss.example.com',
    smtp: {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTls: true,
      pool,
      auth
    },
    from: Object.freeze({ name: 'RSSMonster', address: 'rss@example.com' }),
    replyTo: 'support@example.com'
  };
};

const createFakeTransport = () => ({
  verify: vi.fn().mockResolvedValue(true),
  sendMail: vi.fn().mockResolvedValue({ messageId: 'provider-message-id' }),
  close: vi.fn()
});

const createTestService = ({ transport = createFakeTransport(), logger = null, pool = false } = {}) => {
  const createTransport = vi.fn().mockReturnValue(transport);
  return {
    service: createMailService({
      configuration: enabledConfiguration({ pool }),
      createTransport,
      logger
    }),
    createTransport,
    transport
  };
};

const verificationEmail = (user, overrides = {}) => ({
  userId: user.id,
  recipient: user.email,
  templateType: 'email_verification',
  templateData: { actionUrl: 'https://rss.example.com/verify?token=secret-token' },
  dedupeKey: uniqueValue('verification'),
  scheduledAt: NOW,
  ...overrides
});

describe('mail service and durable outbox', () => {
  beforeEach(async () => {
    await EmailDelivery.destroy({ where: {} });
  });

  it('does nothing transport-related while email is disabled', async () => {
    const createTransport = vi.fn();
    const service = createMailService({
      configuration: { enabled: false },
      createTransport
    });

    await expect(service.verifyEmailTransport()).resolves.toEqual({
      enabled: false,
      verified: false
    });
    await expect(service.claimPendingEmails()).resolves.toEqual([]);
    await expect(service.enqueueEmail({})).rejects.toBeInstanceOf(EmailDisabledError);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('verifies and reuses one optionally pooled transport', async () => {
    const { service, createTransport, transport } = createTestService({ pool: true });

    await service.verifyEmailTransport();
    await service.verifyEmailTransport();

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      pool: true,
      auth: expect.objectContaining({ user: 'smtp-user', pass: 'smtp-password' })
    }));
    expect(transport.verify).toHaveBeenCalledTimes(2);
    await service.closeEmailTransport();
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('persists a complete message before attempting delivery and deduplicates it', async () => {
    const user = await createUser();
    const { service, transport } = createTestService();
    const input = verificationEmail(user);

    const first = await service.enqueueEmail(input);
    const duplicate = await service.enqueueEmail({
      ...input,
      templateData: { actionUrl: 'https://rss.example.com/verify?token=ignored' }
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.delivery.id).toBe(first.delivery.id);
    expect(first.delivery).toMatchObject({
      userId: user.id,
      messageType: 'email_verification',
      recipient: user.email,
      status: 'pending',
      attemptCount: 0,
      retryCount: 0,
      maxAttempts: 5,
      scheduledAt: NOW,
      availableAt: NOW
    });
    expect(first.delivery.payload.text).toContain('secret-token');
    expect(first.delivery.toJSON()).not.toHaveProperty('payload');
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it.each(['daily_digest', 'password_reset'])(
    'requires the current verified address for %s delivery',
    async templateType => {
      const user = await createUser();
      const { service } = createTestService();
      const templateData = templateType === 'daily_digest'
        ? {
            briefingUrl: 'https://rss.example.com/briefing',
            preferencesUrl: 'https://rss.example.com/settings',
            timezone: 'UTC',
            recommended: [],
            topStories: []
          }
        : { actionUrl: 'https://rss.example.com/reset' };
      const input = {
        userId: user.id,
        recipient: user.email,
        templateType,
        templateData,
        dedupeKey: uniqueValue(templateType),
        scheduledAt: NOW
      };

      await expect(service.enqueueEmail(input)).rejects.toThrow('verified email address');
      await user.update({ emailVerifiedAt: NOW });
      await expect(service.enqueueEmail(input)).resolves.toMatchObject({ created: true });
      await expect(service.enqueueEmail({
        ...input,
        recipient: 'different@example.com',
        dedupeKey: uniqueValue(`${templateType}-different`)
      })).rejects.toThrow('verified email address');
    }
  );

  it('participates in a producer transaction', async () => {
    const user = await createUser();
    const { service } = createTestService();
    const dedupeKey = uniqueValue('rolled-back');

    await expect(sequelize.transaction(async transaction => {
      await service.enqueueEmail(verificationEmail(user, { dedupeKey }), { transaction });
      throw new Error('rollback requested');
    })).rejects.toThrow('rollback requested');

    expect(await EmailDelivery.count({ where: { userId: user.id, dedupeKey } })).toBe(0);
  });

  it('gives concurrent MySQL workers disjoint delivery claims', async () => {
    if (sequelize.getDialect() !== 'mysql') return;
    const user = await createUser();
    const { service } = createTestService();
    await Promise.all(Array.from({ length: 4 }, (_, index) => service.enqueueEmail(
      verificationEmail(user, { dedupeKey: uniqueValue(`concurrent-${index}`) })
    )));

    const [workerA, workerB] = await Promise.all([
      service.claimPendingEmails({ limit: 3, now: NOW, leaseOwner: 'email-worker-a' }),
      service.claimPendingEmails({ limit: 3, now: NOW, leaseOwner: 'email-worker-b' })
    ]);
    const claimedIds = [...workerA, ...workerB].map(delivery => delivery.id);

    expect(claimedIds).toHaveLength(4);
    expect(new Set(claimedIds).size).toBe(4);
  });

  it('reclaims expired work while fencing the stale worker', async () => {
    const user = await createUser();
    const { service, transport } = createTestService();
    await service.enqueueEmail(verificationEmail(user, { maxAttempts: 3 }));
    const [staleClaim] = await service.claimPendingEmails({
      now: NOW,
      leaseMs: 1000,
      leaseOwner: 'email-worker-stale'
    });
    const reclaimAt = new Date(NOW.getTime() + 1001);
    const [reclaimed] = await service.claimPendingEmails({
      now: reclaimAt,
      leaseMs: 1000,
      leaseOwner: 'email-worker-recovery'
    });

    expect(reclaimed).toMatchObject({
      id: staleClaim.id,
      attemptCount: 2,
      retryCount: 1,
      leaseOwner: 'email-worker-recovery'
    });
    await expect(service.sendClaimedEmail(staleClaim, {
      now: () => reclaimAt,
      leaseMs: 1000
    })).resolves.toEqual({ status: 'lease_lost' });
    expect(transport.sendMail).not.toHaveBeenCalled();

    await expect(service.sendClaimedEmail(reclaimed, {
      now: () => reclaimAt,
      leaseMs: 1000
    })).resolves.toMatchObject({ status: 'sent' });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it('sends only a claimed persisted message and records provider completion', async () => {
    const user = await createUser();
    const { service, transport } = createTestService();
    await service.enqueueEmail(verificationEmail(user));
    const [claimed] = await service.claimPendingEmails({
      now: NOW,
      leaseOwner: 'email-worker-success'
    });

    const result = await service.sendClaimedEmail(claimed, { now: () => NOW });

    expect(result).toEqual({
      status: 'sent',
      providerMessageId: 'provider-message-id'
    });
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: enabledConfiguration().from,
      replyTo: enabledConfiguration().replyTo,
      to: user.email,
      subject: 'Verify your RSSMonster email address',
      text: expect.stringContaining('secret-token'),
      html: expect.stringContaining('<!doctype html>')
    }));
    await claimed.reload();
    expect(claimed).toMatchObject({
      status: 'sent',
      attemptCount: 1,
      retryCount: 0,
      leaseOwner: null,
      leaseUntil: null,
      providerMessageId: 'provider-message-id',
      completedAt: NOW
    });
  });

  it('delivers an empty-state daily briefing test to the verified address', async () => {
    const user = await createUser({ emailVerifiedAt: NOW });
    const { service, transport } = createTestService();
    const queued = await service.enqueueEmail({
      userId: user.id,
      recipient: user.email,
      templateType: 'daily_digest',
      templateData: {
        briefingUrl: 'https://rss.example.com',
        preferencesUrl: 'https://rss.example.com',
        timezone: 'UTC',
        recommended: [],
        topStories: [],
        testMode: true
      },
      dedupeKey: uniqueValue('daily-digest-test'),
      scheduledAt: NOW
    });
    const [claimed] = await service.claimPendingEmails({
      now: NOW,
      leaseOwner: 'email-worker-digest-test'
    });

    expect(queued.delivery.payload.subject)
      .toBe('RSSMonster daily briefing test — example email');
    expect(queued.delivery.payload.text).toContain('No new articles were received');
    expect(queued.delivery.payload.html).toContain('No new articles were received');
    await expect(service.sendClaimedEmail(claimed, { now: () => NOW }))
      .resolves.toMatchObject({ status: 'sent' });
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: user.email,
      subject: 'RSSMonster daily briefing test — example email',
      text: expect.stringContaining('No new articles were received'),
      html: expect.stringContaining('No new articles were received')
    }));
  });

  it('passes a mutable sender address to Nodemailer message composition', async () => {
    const user = await createUser();
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const { service } = createTestService({ transport });
    await service.enqueueEmail(verificationEmail(user));
    const [claimed] = await service.claimPendingEmails({
      now: NOW,
      leaseOwner: 'email-worker-nodemailer-composition'
    });

    await expect(service.sendClaimedEmail(claimed, { now: () => NOW }))
      .resolves.toMatchObject({ status: 'sent' });
  });

  it('retries transient failures with bounded backoff and then stops', async () => {
    const user = await createUser();
    const transport = createFakeTransport();
    transport.sendMail
      .mockRejectedValueOnce(Object.assign(new Error('temporary failure'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('still unavailable'), { code: 'ECONNECTION' }));
    const { service } = createTestService({ transport });
    await service.enqueueEmail(verificationEmail(user, { maxAttempts: 2 }));
    const [firstAttempt] = await service.claimPendingEmails({
      now: NOW,
      leaseOwner: 'email-worker-first'
    });

    const retry = await service.sendClaimedEmail(firstAttempt, {
      now: () => NOW,
      retryOptions: {
        baseDelayMs: 1000,
        maxDelayMs: 10_000,
        jitterRatio: 0,
        random: () => 0
      }
    });
    expect(retry).toMatchObject({
      status: 'pending',
      retryable: true,
      retryCount: 1,
      availableAt: new Date(NOW.getTime() + 1000)
    });

    const retryAt = retry.availableAt;
    const [secondAttempt] = await service.claimPendingEmails({
      now: retryAt,
      leaseOwner: 'email-worker-second'
    });
    const terminal = await service.sendClaimedEmail(secondAttempt, {
      now: () => retryAt,
      retryOptions: { jitterRatio: 0, random: () => 0 }
    });

    expect(terminal).toMatchObject({ status: 'failed', retryable: true, retryCount: 1 });
    await secondAttempt.reload();
    expect(secondAttempt).toMatchObject({
      status: 'failed',
      attemptCount: 2,
      retryCount: 1,
      leaseOwner: null,
      leaseUntil: null,
      completedAt: retryAt
    });
  });

  it('marks permanent SMTP failures terminal without retrying', async () => {
    const user = await createUser();
    const transport = createFakeTransport();
    transport.sendMail.mockRejectedValue(Object.assign(new Error('mailbox rejected'), {
      code: 'EENVELOPE',
      responseCode: 550
    }));
    const { service } = createTestService({ transport });
    await service.enqueueEmail(verificationEmail(user));
    const [claimed] = await service.claimPendingEmails({
      now: NOW,
      leaseOwner: 'email-worker-permanent'
    });

    const result = await service.sendClaimedEmail(claimed, { now: () => NOW });

    expect(result).toMatchObject({ status: 'failed', retryable: false });
    await claimed.reload();
    expect(claimed.status).toBe('failed');
    expect(claimed.retryCount).toBe(0);
    expect(claimed.completedAt).toEqual(NOW);
  });

  it('logs lifecycle metadata without recipients, tokens, passwords, or bodies', async () => {
    const user = await createUser();
    const transport = createFakeTransport();
    transport.sendMail.mockRejectedValue(Object.assign(
      new Error(`failure for ${user.email} token=secret-token smtp-password`),
      { code: 'ETIMEDOUT' }
    ));
    const logger = { log: vi.fn() };
    const { service } = createTestService({ transport, logger });
    await service.enqueueEmail(verificationEmail(user));
    const [claimed] = await service.claimPendingEmails({
      now: NOW,
      leaseOwner: 'email-worker-safe-logs'
    });

    await service.sendClaimedEmail(claimed, { now: () => NOW });

    const logs = logger.log.mock.calls.flat().join('\n');
    expect(logs).toContain('deliveryId');
    expect(logs).not.toContain(user.email);
    expect(logs).not.toContain('secret-token');
    expect(logs).not.toContain('smtp-password');
    expect(logs).not.toContain('failure for');
  });

  it('logs a safe failure phase, reason, and SMTP response code', async () => {
    const user = await createUser();
    const transport = createFakeTransport();
    transport.sendMail.mockRejectedValue(Object.assign(
      new Error(`rejected ${user.email} token=secret-token smtp-password`),
      { code: 'EAUTH', responseCode: 535 }
    ));
    const logger = { log: vi.fn() };
    const { service } = createTestService({ transport, logger });
    await service.enqueueEmail(verificationEmail(user));
    const [claimed] = await service.claimPendingEmails({
      now: NOW,
      leaseOwner: 'email-worker-diagnostic-logs'
    });

    await service.sendClaimedEmail(claimed, { now: () => NOW });

    const logs = logger.log.mock.calls.flat().join('\n');
    expect(logs).toContain('failurePhase="smtp_send"');
    expect(logs).toContain('failureReason="smtp_authentication_failed"');
    expect(logs).toContain('responseCode=535');
    expect(logs).not.toContain(user.email);
    expect(logs).not.toContain('secret-token');
    expect(logs).not.toContain('smtp-password');
  });

  it('classifies explicit, SMTP, and network failures conservatively', () => {
    expect(isTransientEmailError({ retryable: false, code: 'ETIMEDOUT' })).toBe(false);
    expect(isTransientEmailError({ responseCode: 421 })).toBe(true);
    expect(isTransientEmailError({ responseCode: 550 })).toBe(false);
    expect(isTransientEmailError({ code: 'EAUTH' })).toBe(false);
    expect(isTransientEmailError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientEmailError(new Error('unknown provider failure'))).toBe(true);
  });
});
