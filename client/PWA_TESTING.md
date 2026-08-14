# PWA and notification testing

Service workers are disabled during ordinary `npm run dev` sessions. Use a
production build and preview server when testing install, offline, update, or
notification behavior.

## Production and development servers

Run the production workflow:

```bash
npm run build
npm run preview -- --port 4173
```

Open `http://localhost:4173` in a clean Chrome profile. A normal clean profile
is required for the installability check because Chrome reports applications
opened in an Incognito context as non-installable.

To compare ordinary development behavior without a port conflict, run this in
a second terminal:

```bash
npm run dev -- --port 8081
```

At `http://localhost:8081`, Application > Service Workers must show no
registration. Production and development use different origins, so registrations
cannot be confused.

## Install and offline behavior

1. Open Application > Service Workers at the production origin.
2. Confirm there is exactly one registration, its active worker is `sw.js`, and
   the page is controlled.
3. Open Application > Manifest and confirm Chrome reports no installability
   errors.
4. Load the application once while online.
5. Enable Offline in the Network panel and reload.
6. Confirm the cached RSSMonster application shell still opens. Backend requests
   can fail while offline; those network errors are expected.
7. Repeat the offline reload at desktop and mobile widths. Confirm the sidebar,
   applicable toolbar, mobile menu overlay, and saved reader mode have no missing
   static chunk failures.
8. Disable Offline and retry or reload. Confirm normal application content
   recovers and no new service-worker registration is created.

Settings, management screens, dialogs, the assistant, and sidebar drag-and-drop
are intentionally excluded from first-visit offline coverage. Open an optional
feature online once to place its content-hashed JavaScript and CSS in the bounded
`rssmonster-optional-hashed-assets-v1` runtime cache; subsequent visits can reuse
those responses. API, authentication, article-data, and settings-data requests
remain network-only under this static-asset policy.

The following console expressions provide concise evidence:

```js
await navigator.serviceWorker.getRegistrations()
navigator.serviceWorker.controller?.scriptURL
await caches.keys()
```

## Application updates

The configured strategy is `registerType: 'autoUpdate'`: a newly installed
worker uses `skipWaiting`, claims clients, and does not display a refresh prompt.

1. Keep the production page open after the first build.
2. Make a temporary, identifiable change to a precached asset and run
   `npm run build` again. Vite preview serves the updated `dist` directory
   without needing a second registration mechanism.
3. Return to the open application. Reload, navigate, or use the Service Workers
   **Update** action to cause the browser to check for the new worker.
4. Confirm `controllerchange` occurs once, the new worker reaches `activated`,
   there is no waiting worker, and the registration count remains one.
5. Confirm the changed asset is present in the current Workbox precache.
6. In Application > Cache Storage, confirm old Workbox precache names and
   entries that are not part of the current manifest have been removed.
7. Revert the temporary asset change and create the final production build.

## Notification permission

The server must provide `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
`VAPID_SUBJECT`. The subject must be a `mailto:` address or an HTTPS URL. Apply
the `push_subscriptions` migration before testing subscriptions. The production
service worker imports `push-sw.js`, which displays background pushes and opens
RSSMonster when a notification is selected.

On iOS/iPadOS, first open RSSMonster in an ordinary browser tab and confirm the
Options sheet says **Home Screen app required** and explains how to add it to
the Home Screen. Then add and launch the app from the Home Screen before
continuing with the permission checks below.

Use a mobile viewport so the Options sheet is available.

1. Reset notification permission for the preview origin to the browser default.
2. Load RSSMonster and confirm no permission prompt appears during startup.
3. Open Options. The button must read **Enable notifications**.
4. Press the button, grant permission, and confirm it changes to
   **Disable notifications**.
5. Deny permission in browser settings, reopen Options, and confirm it reads
   **Notifications blocked in browser**.
6. Reset permission to the default state, reopen Options, and confirm it again
   reads **Enable notifications**.
7. The unsupported state cannot be produced in ordinary Chrome. Cover it with a
   browser capability simulation or the focused component test and confirm the
   button reads **Notifications unavailable**.
8. With permission granted, close the app, trigger a crawl that persists new
   articles, and confirm the operating-system notification is displayed.
9. Select the notification and confirm the installed app opens or its existing
   window receives focus.
10. Reopen Options, press **Disable notifications**, and confirm a later crawl
    does not deliver another notification to that browser.

## Automated real-browser validation record

Validated on 2026-07-30 with installed Chrome in clean persistent and isolated
browser contexts. The real production preview assets and service worker were
used. API responses were locally intercepted only to enter the authenticated
AppShell and exercise its Options UI; no production PWA responses were mocked.

- Production registered exactly one activated `sw.js`, and it controlled the
  page.
- Development registered no worker and created no cache.
- A clean persistent profile reported no manifest or installability errors.
- The production shell reloaded offline and recovered after returning online.
- Two subsequent builds each produced one `controllerchange`; the new worker
  activated with no waiting worker or refresh prompt.
- A deliberately outdated Workbox precache was removed during activation.
- Startup notification request count remained zero while permission was
  `default`.
- Clicking **Enable notifications** changed the request count from zero to one.
- Default, granted, denied, and simulated-unsupported labels matched the states
  documented above.
- No unexpected browser console errors occurred online. Offline mode produced
  only expected `ERR_INTERNET_DISCONNECTED` resource errors.

This record is automated real-browser evidence. The checklist sections above
remain the manual DevTools procedure for release testing, including the final
operating-system notification delivery check that requires a working backend.
