import { describe, expect, it, vi } from 'vitest';
import {
  createEmailDeliveryWorker,
  EMAIL_DELIVERY_BATCH_SIZE,
  EMAIL_DELIVERY_POLL_INTERVAL_MS
} from '../../services/email/emailDeliveryWorker.js';

const createLogger = () => ({ error: vi.fn(), log: vi.fn() });

const createMailService = overrides => ({
  claimPendingEmails: vi.fn().mockResolvedValue([]),
  closeEmailTransport: vi.fn().mockResolvedValue(undefined),
  sendClaimedEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
  verifyEmailTransport: vi.fn().mockResolvedValue({ enabled: true, verified: true }),
  ...overrides
});

describe('email delivery worker', () => {
  it('verifies SMTP, drains one bounded batch, and logs safe lifecycle state', async () => {
    const delivery = {
      id: 'delivery-id',
      userId: 7,
      messageType: 'email_verification',
      recipient: 'private@example.com',
      payload: { text: 'secret-token' }
    };
    const mailService = createMailService({
      claimPendingEmails: vi.fn().mockResolvedValue([delivery])
    });
    const logger = createLogger();
    const worker = createEmailDeliveryWorker({
      intervalMs: 60_000,
      logger,
      mailService
    });

    await worker.start();
    await worker.stop();

    expect(mailService.verifyEmailTransport).toHaveBeenCalledOnce();
    expect(mailService.claimPendingEmails).toHaveBeenCalledWith({
      limit: EMAIL_DELIVERY_BATCH_SIZE
    });
    expect(mailService.sendClaimedEmail).toHaveBeenCalledWith(delivery);
    expect(mailService.closeEmailTransport).toHaveBeenCalledOnce();
    const logs = [...logger.log.mock.calls, ...logger.error.mock.calls].flat().join('\n');
    expect(logs).toContain('transport.verified');
    expect(logs).toContain('outbox.claimed count=1');
    expect(logs).not.toContain('private@example.com');
    expect(logs).not.toContain('secret-token');
    expect(EMAIL_DELIVERY_POLL_INTERVAL_MS).toBe(5000);
  });

  it('logs only safe SMTP diagnostics and continues to inspect the outbox', async () => {
    const mailService = createMailService({
      verifyEmailTransport: vi.fn().mockRejectedValue(Object.assign(
        new Error('smtp-user password=secret'),
        { code: 'EAUTH', responseCode: 535 }
      ))
    });
    const logger = createLogger();
    const worker = createEmailDeliveryWorker({
      intervalMs: 60_000,
      logger,
      mailService
    });

    await worker.start();
    await worker.stop();

    expect(mailService.claimPendingEmails).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      '[EmailWorker] transport.failed errorCode="EAUTH" responseCode=535'
    );
    const logs = logger.error.mock.calls.flat().join('\n');
    expect(logs).not.toContain('smtp-user');
    expect(logs).not.toContain('password=secret');
  });

  it('does not overlap polls and isolates unexpected delivery failures', async () => {
    let resolveClaim;
    const pendingClaim = new Promise(resolve => {
      resolveClaim = resolve;
    });
    const delivery = { id: 'failed-id', userId: 9, messageType: 'password_reset' };
    const mailService = createMailService({
      claimPendingEmails: vi.fn().mockReturnValue(pendingClaim),
      sendClaimedEmail: vi.fn().mockRejectedValue(Object.assign(
        new Error('private provider response'),
        { code: 'ESOCKET' }
      ))
    });
    const logger = createLogger();
    const worker = createEmailDeliveryWorker({ logger, mailService });

    const firstRun = worker.runOnce();
    const overlappingRun = worker.runOnce();
    expect(overlappingRun).toBe(firstRun);
    expect(mailService.claimPendingEmails).toHaveBeenCalledOnce();
    resolveClaim([delivery]);
    await firstRun;

    expect(logger.error).toHaveBeenCalledWith(
      '[EmailWorker] delivery.unhandled deliveryId="failed-id" userId=9 ' +
      'messageType="password_reset" errorCode="ESOCKET"'
    );
    expect(logger.error.mock.calls.flat().join('\n'))
      .not.toContain('private provider response');
  });
});
