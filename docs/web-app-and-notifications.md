---
layout: page
title: Progressive Web App and Notifications
parent: Using RSSMonster
nav_order: 16
---

# Progressive Web App (PWA) and Notifications

A **Progressive Web App (PWA)** is a website that you can install and launch like
an app. RSSMonster's PWA gives you an icon on your Home Screen or app launcher
and opens in its own window on supported devices. It connects to the same
self-hosted RSSMonster instance and account you use in the browser.

For an app that runs its own local backend and SQLite database, see
[RSSMonster Desktop (Electron)]({% link desktop.md %}). Desktop uses manual refresh
and does not include the PWA's notification functionality.

Use it to open your feeds quickly, read and bookmark articles, check your
[Daily Briefing]({% link daily-briefing.md %}), and receive notifications when new
articles arrive. Notifications are optional and require both server configuration
and permission on each browser or device.

## Install RSSMonster

Open your RSSMonster instance over **HTTPS** in a browser that supports web-app
installation. Installation options vary by browser and device. For local
development, `localhost` is also a suitable secure context.

When RSSMonster shows **Install RSSMonster**, select **Install** and confirm the
browser's prompt. On iPhone and iPad, the banner instead explains how to use
**Add to Home Screen**. Selecting **Not now** dismisses RSSMonster's banner for
that browser; you can still use the browser's own installation controls later.

### iPhone and iPad

1. Open your RSSMonster address in Safari.
2. Open the **Share** menu and select **Add to Home Screen**.
3. If **Open as Web App** is offered, leave it enabled, then select **Add**.
4. Launch RSSMonster using its new Home Screen icon and sign in if needed.

On iOS and iPadOS, launch the Home Screen app before enabling RSSMonster
notifications. See [Apple's Home Screen installation guide](https://support.apple.com/en-euro/guide/iphone/iphea86e5236/ios)
and [WebKit's guide to Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

### Android

Open RSSMonster in Chrome and select **Install** in the RSSMonster banner when
available. Alternatively, use Chrome's menu and select **Install and create
shortcut → Install**, then follow the prompts. Launch RSSMonster from its app
icon afterward. Menu wording can vary with the browser version; see
[Chrome's Android web-app guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en).

### Desktop

In Chrome, open RSSMonster and use the install icon in the address bar, or
**More → Cast, save, and share → Install page as app**. Confirm installation,
then launch RSSMonster from your computer's app launcher. Other supporting
browsers provide their own installation menus. See
[Chrome's desktop web-app guide](https://support.google.com/chrome/answer/9658361?co=genie.platform%3DDesktop&hl=en).

## Use the installed app

The installed app offers the same reading modes, subscriptions, tags, favorites,
and settings as RSSMonster in a browser. Sign in to the same server and account
on another device to access your stored subscriptions and article state.
Notification permission and subscriptions must be enabled on each device where
you want alerts.

Your RSSMonster server continues to crawl feeds according to its configuration
while the app is closed. Opening the app lets you read the stored results;
installing it does not run a separate crawler on your phone or computer.

The app checks for updated application assets through its service worker, the
browser's background component for caching and Push. After the operator updates
RSSMonster, reopening or reloading the app lets it pick up the update. You do
not need to reinstall the app for ordinary server updates.

## Offline support

Installation does not download your entire archive for offline reading. The
service worker caches the basic interface and application assets after an online
visit, so the app's shell can reopen without a connection. Fetching articles,
signing in, loading settings, and saving reading state still require access to
the RSSMonster server. Optional screens may also need to be opened online first.

If the interface opens but articles cannot load, reconnect to the network and
retry or reload. A private instance must remain reachable through the network
or VPN you normally use to access it.

## Enable notifications

First, the operator must configure Web Push as described in
[Administration → Push notification settings]({% link administration.md %}#push-notification-settings).
Installing the PWA alone does not enable alerts.

1. Open RSSMonster and sign in. On iOS/iPadOS, use its Home Screen icon.
2. Open the mobile or compact-layout **Options** sheet.
3. In **Notifications**, select **Enable notifications**.
4. Allow the browser's notification permission request.

The control changes to **Disable notifications** after subscribing. Opening
RSSMonster or its Options sheet alone does not request permission.

Notifications report newly arrived articles and can update the unread badge on
supported platforms. Selecting a notification opens RSSMonster or focuses its
existing window. Notifications can arrive while the app is closed, subject to
browser and operating-system delivery behavior.

Select **Disable notifications** to remove this browser's subscription. This
does not disable alerts on your other subscribed devices.

Push subscriptions belong to the current user and browser/device. Delivery uses
the browser vendor's Push service; it is separate from SMTP and
[briefing emails]({% link account.md %}).

### Notification troubleshooting

| Message or symptom | What to do |
| --- | --- |
| Home Screen app required | On iOS/iPadOS, install RSSMonster and open it from its Home Screen icon. |
| Notifications blocked in browser | Allow notifications in browser or operating-system settings, then reopen Options. |
| Notifications unavailable | Read the accompanying message. The browser may not support Web Push, or the operator may need to configure the server. |
| Restore notifications | Permission is already granted; select this to register the missing subscription again. |
| Retry notification check | Restore connectivity and select the control to check again. |
| Notifications enabled, but no alert arrives | Check that a crawl actually saved new articles, device notification settings allow alerts, and the crawl worker has the server Push configuration. |

## Configure Web Push on the server

These are operator settings in the deployment environment, rather than fields
in the in-app Settings dialog. See the [Administration guide]({% link administration.md %}#push-notification-settings)
and [Configuration → Email and Web Push]({% link configuration.md %}#email-and-web-push)
for how they fit into the server setup.

All three values must be present in the processes sending Push notifications:

| Variable | Purpose |
| --- | --- |
| `VAPID_PUBLIC_KEY` | Public application-server key supplied to browsers. |
| `VAPID_PRIVATE_KEY` | Matching private key; keep it secret and stable. |
| `VAPID_SUBJECT` | Contact URI, such as `mailto:admin@example.com`. |

Generate a key pair with the server's existing dependency, from `server`:

```bash
node --input-type=module -e "import webpush from 'web-push'; console.log(webpush.generateVAPIDKeys())"
```

The bundled CLI is an alternative after installing server dependencies:

```bash
# Run from server.
./node_modules/.bin/web-push generate-vapid-keys
```

Use one public/private VAPID pair for the installation. The public key identifies
the application server to browsers; the private key signs outgoing Push
requests. Each browser creates its own endpoint and encryption keys after the
user grants permission. RSSMonster stores that subscription against the signed-in
user and encrypts delivery through the browser's Push service. That service
does not receive the RSSMonster login token or VAPID private key.

Add the generated values without surrounding whitespace to `server/.env` for a
source installation, or to the repository-root `.env` for Docker Compose:

```env
# Optional Web Push notification configuration (VAPID).
VAPID_PUBLIC_KEY=replace-with-the-generated-public-key
VAPID_PRIVATE_KEY=replace-with-the-generated-private-key
VAPID_SUBJECT=mailto:admin@example.com
```

`VAPID_SUBJECT` must identify the operator with a `mailto:` address or an HTTPS
URL, such as `https://rss.example.com`. Keep the key pair stable for the lifetime
of the installation: replacing it can invalidate existing subscriptions. Never
commit the private key or put it in client-side configuration. Unset VAPID values
disable Push without preventing ordinary reading.

Both supplied Compose profiles already pass the variables to the web service.
The dedicated crawl workers also deliver notifications, but their supplied
`environment` blocks do not list VAPID values. For scheduled-crawl notifications,
add the following to `rssmonster-worker.environment` in your deployment override:

```yaml
VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
VAPID_SUBJECT: ${VAPID_SUBJECT:-}
```

A root `.env` entry alone does not inject an unlisted variable. Recreate the
containers with `docker compose up -d` using your selected Compose files and
override. For source installations, restart the web and crawl-worker processes
after updating their environment; `cd server && npm start` starts the foreground
web process. See [Configuration]({% link configuration.md %}#where-configuration-lives).

Notifications can arrive when the installed web app is closed, subject to browser
and operating-system delivery behavior. Enable them in the Options sheet as
explained above. If RSSMonster reports Push as unconfigured, check all three
values in the responsible process and restart it. The control can restore a
missing subscription; denied permission must be changed in browser or OS settings.

`GET /api/push/configuration` reports availability and the public key.
`GET`, `POST`, and `DELETE /api/push/subscription` inspect or manage a subscription
with JWT authentication. Failed deliveries with expired/not-found endpoints
remove the stale subscription; other failures are logged. Zero new articles do
not trigger a notification.
