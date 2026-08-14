// Push delivery remains independent from the application page lifecycle.
self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }

  const badgePromise = typeof self.navigator?.setAppBadge === 'function'
    ? self.navigator.setAppBadge(Math.max(0, Number(payload.badgeCount) || 0)).catch(() => {})
    : Promise.resolve();

  event.waitUntil(Promise.all([
    self.registration.showNotification(payload.title || 'RSSMonster', {
      body: payload.body || 'New articles have arrived',
      icon: '/img/icons/android-chrome-192x192.png',
      badge: '/img/icons/favicon-48x48.png',
      tag: payload.tag || 'rssmonster-new-articles',
      data: { url: payload.url || '/' }
    }),
    badgePromise
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/', self.location.origin);
  const safeUrl = destination.origin === self.location.origin ? destination.href : self.location.origin;

  event.waitUntil((async () => {
    if (typeof self.navigator?.clearAppBadge === 'function') {
      await self.navigator.clearAppBadge().catch(() => {});
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingWindow = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existingWindow) {
      if (existingWindow.url !== safeUrl) await existingWindow.navigate(safeUrl);
      return existingWindow.focus();
    }
    return self.clients.openWindow(safeUrl);
  })());
});
