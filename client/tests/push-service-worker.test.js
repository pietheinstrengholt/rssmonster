import { afterEach, describe, expect, it, vi } from 'vitest';

const loadPushWorker = async ({ windows = [] } = {}) => {
  const handlers = {};
  const showNotification = vi.fn().mockResolvedValue();
  const setAppBadge = vi.fn().mockResolvedValue();
  const clearAppBadge = vi.fn().mockResolvedValue();
  const openWindow = vi.fn().mockResolvedValue();
  const matchAll = vi.fn().mockResolvedValue(windows);

  vi.stubGlobal('self', {
    addEventListener: (type, handler) => { handlers[type] = handler; },
    clients: { matchAll, openWindow },
    location: { origin: 'https://rssmonster.example' },
    navigator: { clearAppBadge, setAppBadge },
    registration: { showNotification }
  });
  vi.resetModules();
  await import('../public/push-sw.js');

  return {
    clearAppBadge,
    handlers,
    matchAll,
    openWindow,
    setAppBadge,
    showNotification
  };
};

const dispatchExtendableEvent = async (handler, event) => {
  let lifetime;
  handler({
    ...event,
    waitUntil: promise => { lifetime = promise; }
  });
  await lifetime;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('push service worker', () => {
  it('always displays a user-visible notification and updates the badge', async () => {
    const worker = await loadPushWorker();

    await dispatchExtendableEvent(worker.handlers.push, {
      data: {
        json: () => ({
          title: 'New articles',
          body: '2 new articles have arrived',
          badgeCount: 2,
          tag: 'new-articles',
          url: '/?feed=7'
        })
      }
    });

    expect(worker.setAppBadge).toHaveBeenCalledWith(2);
    expect(worker.showNotification).toHaveBeenCalledWith('New articles', expect.objectContaining({
      body: '2 new articles have arrived',
      tag: 'new-articles',
      data: { url: '/?feed=7' }
    }));
  });

  it('clears the badge and focuses an existing same-origin window', async () => {
    const existingWindow = {
      url: 'https://rssmonster.example/',
      focus: vi.fn().mockResolvedValue(),
      navigate: vi.fn().mockResolvedValue()
    };
    const worker = await loadPushWorker({ windows: [existingWindow] });
    const close = vi.fn();

    await dispatchExtendableEvent(worker.handlers.notificationclick, {
      notification: { close, data: { url: '/' } }
    });

    expect(close).toHaveBeenCalledOnce();
    expect(worker.clearAppBadge).toHaveBeenCalledOnce();
    expect(existingWindow.navigate).not.toHaveBeenCalled();
    expect(existingWindow.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('opens a safe same-origin destination when no app window exists', async () => {
    const worker = await loadPushWorker();

    await dispatchExtendableEvent(worker.handlers.notificationclick, {
      notification: { close: vi.fn(), data: { url: 'https://outside.example/article' } }
    });

    expect(worker.openWindow).toHaveBeenCalledWith('https://rssmonster.example');
  });
});
