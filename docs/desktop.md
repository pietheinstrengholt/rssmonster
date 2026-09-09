---
layout: page
title: Desktop App (Electron)
parent: Getting Started
nav_order: 4
---

# Run RSSMonster as a desktop app

RSSMonster can also run as an app on your computer. Introduced in **v2.3.0**,
RSSMonster Desktop uses Electron to open the existing reader in its own window
and run the backend locally. You do not need Docker, a separate database server,
or an inference service to use the installed app.

Your subscriptions, articles, and reading state are stored in a local SQLite
database. The desktop app uses its own account and data; it does not automatically
connect or sync with an existing self-hosted RSSMonster installation.

## Download and install

Open [RSSMonster releases on GitHub](https://github.com/pietheinstrengholt/rssmonster/releases)
and choose the installer for your system from a published release's **Assets**:

| System | Download |
| --- | --- |
| Windows x64 | `RSSMonster-Setup-2.3.0-x64.exe` |
| macOS, Intel | `RSSMonster-2.3.0-x64.dmg` |
| macOS, Apple Silicon | `RSSMonster-2.3.0-arm64.dmg` |
| Linux x64 | `RSSMonster-2.3.0-x86_64.AppImage` or `RSSMonster-2.3.0-amd64.deb` |

The version in each filename changes with the release. Installers only become
publicly available after the desktop builds finish and the draft release is
published. If a release has no desktop assets yet, use the source instructions
below or choose a release that includes them.

- **Windows:** run the `.exe` installer and launch RSSMonster.
- **macOS:** open the `.dmg` and copy RSSMonster to Applications.
- **Linux:** install the `.deb` with your package manager, or make the AppImage
  executable and run it on a system with AppImage support.

The initial binaries are **unsigned** and macOS builds are not notarized. Your
operating system may show a trust warning or block opening the app. Signing and
notarization are planned separately.

## Start reading

1. Launch RSSMonster and [create your local account]({% link first-login.md %}).
2. [Add a feed]({% link feeds-and-categories.md %}) or
   [import subscriptions from OPML]({% link opml.md %}).
3. Use **Refresh** to fetch updates through the existing reader interface.
4. Read articles, organize subscriptions, and save
   [bookmarks]({% link bookmarks.md %}).

**Desktop refresh is manual.** Feeds are fetched through actions in the app;
there is no scheduled crawler or worker process checking for updates. Closing
the last window exits RSSMonster and stops its local server. An active refresh
may need time to finish before shutdown completes.

## What runs on your computer

Electron starts the existing Express backend, initializes SQLite, and serves the
existing Vue frontend over `http://127.0.0.1` on an available local port. The
reader continues using the same HTTP REST API as the web version. The server is
bound to your computer's loopback interface, not exposed to your network.

Desktop starts no inference service, AI worker, or crawl worker process. AI
content processing, embeddings, and inference-backed features such as the
assistant are unavailable. Network access is still needed to fetch feeds and
load remote article media.

## Storage, backups, and updates

RSSMonster stores desktop data in Electron's operating-system-specific
application data directory (`app.getPath('userData')`), under the application
name **RSSMonster**. The important files are:

- `rssmonster.sqlite`: subscriptions, articles, accounts, and reading state.
- `secrets.json`: persistent authentication secrets; keep this with the database.

The same directory also holds the browser profile and caches. Data is stored
outside the installed application, so replacing the app with a newer version
preserves it. Required database migrations run when the app starts.

Quit RSSMonster fully before copying its application data directory for backup.
Keep the backup private because it contains account data and authentication
secrets. OPML exports preserve subscriptions, but do not replace a database backup.

There is no automatic updater. Download and install a newer release manually,
backing up your data before upgrading.

## Desktop app or installed web app?

The Electron desktop app runs its own local backend and SQLite database.
RSSMonster also offers a [Progressive Web App (PWA)]({% link web-app-and-notifications.md %})
that installs from your browser and connects to an existing self-hosted instance.
Choose the PWA if you want the same server and account across devices. Its
notification support depends on that server and browser; Electron desktop
notifications are not included in this version.

## Run from source

With Node.js **22.19.0 or newer**, npm, and Git installed, clone RSSMonster and
run these commands from the repository root:

```sh
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
npm ci --prefix client
npm ci --prefix server
npm ci --prefix desktop
npm run desktop --prefix desktop
```

This builds the Vue frontend and launches Electron. It does not start the
self-hosted worker or inference services. Use Node.js for the operating system
where you intend to run Electron.

To build an installer for the current machine:

```sh
npm run desktop:build --prefix desktop
```

Artifacts are written to `desktop/release/`. See the
[desktop developer README](https://github.com/pietheinstrengholt/rssmonster/blob/master/desktop/README.md)
for platform-specific commands, native SQLite handling, and verification details.

## Current scope

Desktop provides a local SQLite reader with manual refresh. Background crawling,
worker services, inference/AI, tray mode, notifications, signing, notarization,
and auto-update are outside this initial version. The self-hosted version retains
its existing worker and optional inference functionality.
