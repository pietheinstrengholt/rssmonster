# PWA and notification testing

Service workers are disabled during ordinary `npm run dev` sessions. Use a production build and preview server when testing install, offline, update, or notification behavior.

## Install and offline behavior

1. Run `npm run build` and `npm run preview`.
2. Open the preview URL in a clean browser profile.
3. In browser developer tools, confirm one service worker controls the page and the manifest is installable.
4. Install RSSMonster, load it once while online, then enable offline mode in developer tools.
5. Reload and confirm the cached application shell still opens.

## Application updates

1. Keep the installed or previewed application open after the first production build.
2. Change a visible string, create a second production build, and restart the preview server.
3. Return to the open application and navigate or reload.
4. Confirm the Vite PWA service worker activates the new version automatically without showing a refresh prompt.
5. In developer tools, verify old versioned caches are removed after activation.

## Notification permission

1. Reset notification permission for the preview origin to the browser default.
2. Load RSSMonster and confirm no permission prompt appears during startup.
3. Open the mobile Options menu and press **Enable notifications**.
4. Grant permission and confirm the button changes to **Notifications enabled**.
5. Reset or deny permission in browser settings, reopen Options, and confirm the displayed state matches the browser.
6. With permission granted and the app running in the background, trigger new article delivery and confirm the notification is displayed.
