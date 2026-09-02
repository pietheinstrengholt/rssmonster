// Retires a previously installed application-shell worker when this server has no client build.
export const SERVICE_WORKER_RETIREMENT_SOURCE = `
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(cacheNames.map(cacheName => caches.delete(cacheName))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});
`.trim();

// Serves only when express.static did not find the production service worker.
export const serveServiceWorkerFallback = (_req, res) => res
  .status(200)
  .set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/javascript; charset=utf-8'
  })
  .send(SERVICE_WORKER_RETIREMENT_SOURCE);
