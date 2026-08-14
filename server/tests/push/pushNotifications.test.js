import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  articleCount: vi.fn(),
  findAll: vi.fn(),
  findSetting: vi.fn(),
  upsert: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
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
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
    mocks.articleCount.mockResolvedValue(0);
    mocks.findSetting.mockResolvedValue(null);
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
});
