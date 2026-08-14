import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  configuration: vi.fn(),
  deleteSubscription: vi.fn(),
  saveSubscription: vi.fn()
}));

vi.mock('../src/api/push.js', () => ({
  fetchPushConfiguration: apiMocks.configuration,
  deletePushSubscription: apiMocks.deleteSubscription,
  savePushSubscription: apiMocks.saveSubscription
}));

import {
  getPushNotificationState,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications
} from '../src/services/pushNotifications.js';

const installPushBrowser = ({ permission = 'default', subscription = null } = {}) => {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscription),
    subscribe: vi.fn()
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) }
  });
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue('granted')
  });
  return pushManager;
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete navigator.serviceWorker;
  delete navigator.maxTouchPoints;
});

describe('push notification subscription lifecycle', () => {
  it('requires iOS users to open the installed Home Screen app', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    await expect(getPushNotificationState()).resolves.toEqual({
      available: false,
      reason: 'ios-install-required',
      subscribed: false,
      permission: 'unsupported'
    });
    expect(apiMocks.configuration).not.toHaveBeenCalled();
  });

  it('recognizes iPadOS desktop-class user agents', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5
    });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    await expect(getPushNotificationState()).resolves.toMatchObject({
      reason: 'ios-install-required'
    });
  });

  it('refreshes an existing browser subscription on the server', async () => {
    const subscription = {
      toJSON: () => ({ endpoint: 'https://push.example/existing', keys: {} })
    };
    installPushBrowser({ permission: 'granted', subscription });
    apiMocks.configuration.mockResolvedValue({
      data: { enabled: true, publicKey: 'public-key' }
    });

    await expect(getPushNotificationState()).resolves.toMatchObject({
      available: true,
      reason: null,
      subscribed: true,
      permission: 'granted'
    });
    expect(apiMocks.saveSubscription).toHaveBeenCalledWith(subscription.toJSON());
  });

  it('creates and persists a new PushManager subscription', async () => {
    const created = {
      toJSON: () => ({ endpoint: 'https://push.example/new', keys: {} })
    };
    const pushManager = installPushBrowser();
    pushManager.subscribe.mockResolvedValue(created);

    await expect(subscribeToPushNotifications('AQID')).resolves.toBe(created);
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3])
    });
    expect(apiMocks.saveSubscription).toHaveBeenCalledWith(created.toJSON());
  });

  it('removes the server record before unsubscribing the browser endpoint', async () => {
    const subscription = {
      endpoint: 'https://push.example/current',
      unsubscribe: vi.fn().mockResolvedValue(true)
    };
    installPushBrowser({ permission: 'granted', subscription });

    await expect(unsubscribeFromPushNotifications()).resolves.toBe(true);
    expect(apiMocks.deleteSubscription).toHaveBeenCalledWith(subscription.endpoint);
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });
});
