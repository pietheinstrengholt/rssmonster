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
or a separately configured inference service to use the installed app.

Your subscriptions, articles, and reading state are stored in a local SQLite
database. The desktop app uses its own account and data; it does not automatically
connect or sync with an existing self-hosted RSSMonster installation.

## Download and install

Open [RSSMonster releases on GitHub](https://github.com/pietheinstrengholt/rssmonster/releases)
and choose the installer or portable executable for your system from a published release's **Assets**:

| System | Download |
| --- | --- |
| Windows x64 | `RSSMonster-Setup-2.4.0-x64.exe` |
| Windows x64, portable | `RSSMonster-Portable-2.4.0-x64.exe` |
| macOS, Intel | `RSSMonster-2.4.0-x64.dmg` |
| macOS, Apple Silicon | `RSSMonster-2.4.0-arm64.dmg` |
| Linux x64 | `RSSMonster-2.4.0-x86_64.AppImage` or `RSSMonster-2.4.0-amd64.deb` |

The version in each filename changes with the release. Desktop downloads only become
publicly available after the desktop builds finish and the draft release is
published. If a release has no desktop assets yet, use the source instructions
below or choose a release that includes them.

- **Windows installer:** run the Setup `.exe` installer and launch RSSMonster.
- **Windows portable:** put the Portable `.exe` in a writable folder and run it;
  no installation is needed. You may rename it to `RSSMonster.exe`.
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

Desktop checks eligible feeds automatically while it is running. By default,
closing the window hides it in the system tray; background refresh and AI processing
continue. Click the tray icon or choose **Open RSSMonster** to return to the reader.
Use **Quit RSSMonster** in the tray to stop the app and its services. If the tray is
unavailable or continuation is disabled, closing the window exits.

## Background refresh settings

The local administrator can open **Settings → Background refresh**:

| Setting | Default | Options |
| --- | --- | --- |
| Automatically refresh feeds | On | On / Off |
| Refresh interval | 15 minutes | 5, 15, 30, or 60 minutes |
| Continue running in system tray | On | On / Off |
| Launch RSSMonster when signing in | Off | On / Off where supported |
| Start minimized to tray | Off | On / Off; requires tray continuation |

The interval is the delay between completed eligibility checks. It does not force
all feeds to refresh: feed-specific intervals, publisher caching, and retry deadlines
still apply. Changing it wakes the existing worker. Turning automatic refresh off
lets current work finish and stops future scheduled cycles; manual **Refresh feeds**
and tray **Refresh feeds now** remain available. Checks start after local AI services
are ready and continue while the window is hidden.

The tray shows current activity, last refresh, next eligibility check, and the new
article count from the latest recorded feed run. The compact reader indicator shows
refreshing, processing, disabled, or error states. Hover for timestamps and open
**Refresh history** or **AI Processing** for details. Feed completion does not mean
AI enrichment has finished. A worker failure clears the next check; tray Refresh
can retry it without restarting the app.

Sign-in startup uses the native operating-system API for installed Windows builds.
It is unavailable in development, Windows portable builds, Linux, and the current
unsigned macOS releases; Settings explains the limitation. Portable executables
can move and extract into temporary locations, so RSSMonster registers no startup
entry for them. On Linux, configure startup through your desktop environment.
Tray behavior depends on the desktop environment. If a tray cannot be initialized,
RSSMonster opens its window and keeps close-to-exit available.

These preferences are stored in `desktop-settings.json` alongside the database,
including under portable `data/`. They apply to the Desktop profile and are kept
across restarts and upgrades. Start-minimized applies on the next launch.

## What runs on your computer

Electron starts the existing Express backend, initializes SQLite, and serves the
existing Vue frontend over `http://127.0.0.1` on an available local port. The
reader continues using the same HTTP REST API as the web version. The server is
bound to your computer's loopback interface, not exposed to your network.

Desktop starts its local inference service and AI worker automatically. Classification
uses ModernBERT (`onnx-community/ModernBERT-base-nli-ONNX`), embeddings use
`onnx-community/Qwen3-Embedding-0.6B-ONNX`, and generation uses
`onnx-community/Qwen3.5-0.8B-ONNX`. Assistant is disabled.

The models download on the first launch, requiring internet access and several GB
of disk space. The reader opens while models initialize; AI becomes available once
all models are ready and the window reloads. Subsequent launches reuse cached models.
The local inference endpoint is configured automatically and protected with a
per-launch API key. The AI worker processes enrichment jobs, not scheduled feed
refreshes. The existing crawl worker handles scheduled feed checks. All managed
services stop when you quit the app fully.

## Storage, backups, and updates

Installed RSSMonster stores desktop data in Electron's operating-system-specific
application data directory (`app.getPath('userData')`), under the application
name **RSSMonster**. The important files are:

- `rssmonster.sqlite`: subscriptions, articles, accounts, and reading state.
- `models/`: downloaded local models, reusable across restarts and upgrades.
- `secrets.json`: persistent authentication secrets; keep this with the database.
- `desktop-settings.json`: background-refresh, tray, and startup preferences.

The same directory also holds the browser profile and caches. Data is stored
outside the installed application, so replacing the app with a newer version
preserves it. Required database migrations run when the app starts.

Quit RSSMonster fully before copying its application data directory for backup.
Keep the backup private because it contains account data and authentication
secrets. OPML exports preserve subscriptions, but do not replace a database backup.

There is no automatic updater. Download and install a newer release manually,
backing up your data before upgrading.

### Windows portable storage

The portable executable keeps all persistent application data in `data/` beside
it, including downloaded ModernBERT, Qwen3-Embedding and Qwen3.5 models:

```text
RSSMonster\
├── RSSMonster.exe
└── data\
    ├── rssmonster.sqlite
    ├── secrets.json
    └── models\
```

You only need the executable to start: RSSMonster creates `data/` and its contents
automatically on first launch. Additional Electron/Chromium runtime files and caches
also appear under `data/`. The launcher extracts application binaries temporarily
while running; persistent state remains inside your portable folder.

Use a writable location, such as a folder in Documents or on a USB drive. Protected
locations such as Program Files may prevent startup; RSSMonster displays an error
instead of switching to AppData. Launching through a shortcut or from another working
directory still uses the directory containing the portable executable.

Close RSSMonster fully before backing up or moving the complete RSSMonster folder.
Keep `secrets.json` with the database to preserve authentication secrets. To upgrade,
quit the app fully and replace only `RSSMonster.exe`, preserving `data/`; database
migrations run on the next launch. The installer continues using its existing
`%APPDATA%\RSSMonster` profile. Installed and portable profiles are separate and
are not automatically migrated between modes.

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
npm ci --prefix inference
npm ci --prefix desktop
npm run desktop --prefix desktop
```

This builds the Vue frontend and launches Electron, including managed local
inference and the AI worker. It does not start a crawl worker. Use Node.js for the operating system
where you intend to run Electron.

To build desktop artifacts for the current machine:

```sh
npm run desktop:build --prefix desktop
```

To build both Windows targets explicitly on Windows:

```sh
npm run desktop:build:win --prefix desktop -- x64
```

This produces separate `RSSMonster-Setup-<version>-x64.exe` and
`RSSMonster-Portable-<version>-x64.exe` artifacts. Building does not publish them.

Artifacts are written to `desktop/release/`. See the
[desktop developer README](https://github.com/pietheinstrengholt/rssmonster/blob/master/desktop/README.md)
for platform-specific commands, native SQLite handling, and verification details.

## Current scope

Desktop provides a local SQLite reader with manual and background refresh,
native tray controls, and managed local inference. Native article notifications,
signing, notarization, and auto-update remain outside this version. The self-hosted version retains
its existing worker and optional inference functionality.
