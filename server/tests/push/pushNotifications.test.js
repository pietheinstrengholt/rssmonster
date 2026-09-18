import { encryptSecret } from '../../services/secretEncryption.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  articleCount: vi.fn(),
  findAll: vi.fn(),
  findSetting: vi.fn(),
  findServerSetting: vi.fn(),
  upsert: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    ServerSetting: { findByPk: mocks.findServerSetting },
    Article: { count: mocks.articleCount },
    Setting: { findOne: mocks.findSetting },
    PushSubscription: { findAll: mocks.findAll, upsert: mocks.upsert }
  }
}));

vi.mock('web-push', () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails
  }
}));

import {
  savePushSubscription,
  sendNewArticlePush
} from '../../services/push/pushNotifications.js';

describe('push notification delivery', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
    mocks.articleCount.mockResolvedValue(0);
    mocks.findSetting.mockResolvedValue(null);
    mocks.findServerSetting.mockResolvedValue(null);
  });

  it('atomically assigns a browser endpoint to the authenticated user', async () => {
    mocks.upsert.mockResolvedValue([{}, true]);

    await savePushSubscription(7, {
      endpoint: 'https://push.example/current',
      expirationTime: null,
      keys: { p256dh: 'key', auth: 'auth' }
    });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      endpoint: 'https://push.example/current',
      endpointHash: expect.stringMatching(/^[0-9a-f]{64}$/)
    }));
  });

  it('sends one user-visible payload to each subscription', async () => {
    mocks.findAll.mockResolvedValue([{
      endpoint: 'https://push.example/one',
      expirationTime: null,
      p256dh: 'key',
      auth: 'auth',
      destroy: vi.fn()
    }]);
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    mocks.articleCount.mockResolvedValue(41);

    await expect(sendNewArticlePush(7, 3)).resolves.toEqual({ sent: 1, removed: 0 });
    expect(mocks.findAll).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(mocks.articleCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        filteredInd: false,
        status: 'unread',
        userId: 7
      })
    });
    expect(JSON.parse(mocks.sendNotification.mock.calls[0][1])).toMatchObject({
      title: 'New articles',
      body: '3 new articles have arrived',
      badgeCount: 41,
      unreadCount: 41
    });
  });

  it('removes an expired endpoint without failing other delivery', async () => {
    const destroy = vi.fn().mockResolvedValue(1);
    mocks.findAll.mockResolvedValue([{
      endpoint: 'https://push.example/expired',
      expirationTime: null,
      p256dh: 'key',
      auth: 'auth',
      destroy
    }]);
    mocks.sendNotification.mockRejectedValue({ statusCode: 410 });

    await expect(sendNewArticlePush(7, 1)).resolves.toEqual({ sent: 0, removed: 1 });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('cancels stalled delivery at its deadline while preserving healthy delivery and subscriptions', async () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const socket = { destroy: vi.fn() };
    const logger = { error: vi.fn() };
    mocks.findAll.mockResolvedValue(['stalled', 'healthy'].map(name => ({
      endpoint: `https://push.example/${name}`,
      p256dh: 'key',
      auth: 'auth',
      destroy
    })));
    mocks.sendNotification.mockImplementation((subscription, _payload, options) => {
      if (subscription.endpoint.endsWith('/healthy')) {
        return Promise.resolve({ statusCode: 201 });
      }
      options.agent.sockets['push.example:443'] = [socket];
      return new Promise(() => {});
    });

    const delivery = sendNewArticlePush(7, 1, { logger });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(socket.destroy).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(delivery).resolves.toEqual({ sent: 1, removed: 0 });
    expect(socket.destroy).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[Push] Notification delivery failed:',
      'Push notification delivery timed out'
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([201, 410])('clears the deadline after a completed HTTP %s response', async statusCode => {
    vi.useFakeTimers();
    mocks.findAll.mockResolvedValue([{
      endpoint: 'https://push.example/one',
      p256dh: 'key',
      auth: 'auth',
      destroy: vi.fn().mockResolvedValue(undefined)
    }]);
    mocks.sendNotification.mockImplementation(() => statusCode === 201
      ? Promise.resolve({ statusCode })
      : Promise.reject({ statusCode }));

    await expect(sendNewArticlePush(7, 1)).resolves.toEqual({
      sent: statusCode === 201 ? 1 : 0,
      removed: statusCode === 410 ? 1 : 0
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('uses the decrypted saved key pair for each delivery without setting global VAPID state', async () => {
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  try {
    mocks.findServerSetting.mockResolvedValue({ value: { VAPID_PUBLIC_KEY: encryptSecret('saved-public'), VAPID_PRIVATE_KEY: encryptSecret('saved-private'), VAPID_SUBJECT: 'mailto:owner@example.com' } });
    mocks.findAll.mockResolvedValue([{ endpoint: 'https://push.example/test', p256dh: 'key', auth: 'auth' }]);
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    await sendNewArticlePush(7, 1);
    expect(mocks.sendNotification).toHaveBeenLastCalledWith(expect.any(Object), expect.any(String), expect.objectContaining({ vapidDetails: { subject: 'mailto:owner@example.com', publicKey: 'saved-public', privateKey: 'saved-private' } }));
    expect(mocks.setVapidDetails).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});
