import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import db from '../../models/index.js';
import { clearEmailSettings, saveEmailSettings } from '../../services/email/configuration.js';
import { enqueueEmail } from '../../services/email/emailService.js';
import { createEmailDeliveryWorker } from '../../services/email/emailDeliveryWorker.js';
import { requestUserEmailVerification } from '../../services/email/emailVerification.js';

const environment = {
  EMAIL_ENABLED: 'false', PUBLIC_APP_URL: 'https://reader.example.com', SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'true', SMTP_USER: 'reader',
  SMTP_PASSWORD: 'runtime-test-secret', SMTP_PASSWORD_FILE: '', EMAIL_FROM: 'Reader <reader@example.com>', EMAIL_REPLY_TO: ''
};
let user;
let transport;
beforeEach(async () => {
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  await clearEmailSettings();
  await db.EmailDelivery.destroy({ where: {} });
  user = await db.User.create({ username: `smtp-runtime-${Date.now()}`, email: `smtp-${Date.now()}@example.com`, password: 'test-hash', feverCredentialHash: `smtp-${Date.now()}`, role: 'user' });
  transport = { verify: vi.fn(async () => true), sendMail: vi.fn(async () => ({ messageId: 'test-message' })), close: vi.fn() };
  vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
});
afterEach(async () => {
  await clearEmailSettings();
  await user.destroy();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const save = overrides => saveEmailSettings({ overrides: {
  EMAIL_ENABLED: false, PUBLIC_APP_URL: environment.PUBLIC_APP_URL, SMTP_HOST: environment.SMTP_HOST,
  SMTP_PORT: 587, SMTP_SECURE: false, SMTP_REQUIRE_TLS: true, SMTP_USER: environment.SMTP_USER,
  EMAIL_FROM: environment.EMAIL_FROM, EMAIL_REPLY_TO: '', ...overrides
}, passwordAction: 'replace', password: 'runtime-test-secret' });
const enqueue = key => enqueueEmail({ userId: user.id, recipient: user.email, dedupeKey: key, templateType: 'email_verification', templateData: { actionUrl: 'https://reader.example.com/#verify-email-token=test' } });

describe('SMTP runtime overrides', () => {
  it('keeps disabled workers alive and resolves each delivery batch from the database', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const worker = createEmailDeliveryWorker({ logger });
    try {
      await worker.start();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      await save({ EMAIL_ENABLED: true, SMTP_HOST: 'first.example.com' });
      await enqueue('smtp-runtime-first');
      await worker.runOnce();
      expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ host: 'first.example.com', auth: { user: 'reader', pass: 'runtime-test-secret' } }));
      expect(transport.sendMail).toHaveBeenCalledOnce();
      await save({ EMAIL_ENABLED: true, SMTP_HOST: 'second.example.com' });
      await enqueue('smtp-runtime-second');
      await worker.runOnce();
      expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ host: 'second.example.com' }));
      expect(transport.sendMail).toHaveBeenCalledTimes(2);
      await enqueue('smtp-runtime-disabled');
      await save({ EMAIL_ENABLED: false });
      await worker.runOnce();
      expect(transport.sendMail).toHaveBeenCalledTimes(2);
      expect(await db.EmailDelivery.count({ where: { status: 'pending' } })).toBe(1);
      expect(JSON.stringify(logger.log.mock.calls)).not.toContain('runtime-test-secret');
    } finally { await worker.stop(); }
  });
  it('uses the saved public URL for verification and queues through the existing transaction', async () => {
    await save({ EMAIL_ENABLED: true, PUBLIC_APP_URL: 'https://changed.example.com' });
    await requestUserEmailVerification(user.id);
    const delivery = await db.EmailDelivery.findOne({ where: { userId: user.id } });
    expect(JSON.stringify(delivery.payload)).toContain('https://changed.example.com');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});
