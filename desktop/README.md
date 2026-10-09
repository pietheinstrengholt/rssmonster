# RSSMonster Desktop

Electron runs the existing Express backend and Vue frontend over loopback HTTP.
Desktop uses SQLite and runs the existing crawler, local inference service, and
AI worker as Electron utility processes. Eligible feeds refresh automatically,
including while the window is hidden in the system tray. The renderer continues using REST, with no Node APIs exposed.

Local defaults are ModernBERT (`onnx-community/ModernBERT-base-nli-ONNX`, q8)
classification, `onnx-community/Qwen3-Embedding-0.6B-ONNX` embeddings (1024 dimensions),
and `onnx-community/Qwen3.5-0.8B-ONNX` generation (q4). Assistant is disabled.
Models download on first startup into `userData/models` and load on subsequent starts.
Allow several GB of disk space and sufficient memory for all three CPU models.
`AIEnabled` follows actual model readiness; the window reloads once AI is ready.
The reader can open during model initialization. Startup failures are logged and
close the application; they do not leave services running.

## Develop

Use Node.js >=22.19.0 and npm on the OS where Electron will run. From the repository
root, install the existing packages (skip packages already installed):

```sh
npm install --prefix client
npm install --prefix server
npm ci --prefix inference
npm ci --prefix desktop
npm run desktop --prefix desktop
```

Desktop has its own npm package. Equivalently, `cd desktop` and run
`npm run desktop`. The root `npm run dev` starts the self-hosted stack instead.
The Desktop command builds Vue into `desktop/dist` with same-origin `/api`
requests, then starts Electron. `npm start --prefix desktop` reuses that build.
Restart after server changes; rebuild after client changes. No preload or IPC API.

## Build desktop artifacts

```sh
npm run desktop:build --prefix desktop
npm run desktop:build:mac --prefix desktop
npm run desktop:build:win --prefix desktop
npm run desktop:build:linux --prefix desktop
```

The first command builds for the host OS/architecture. Prefer building each target
on its own OS. For an explicit architecture, for example on an ARM Mac:

```sh
npm run desktop:build:mac --prefix desktop -- arm64
```

Only `x64` and `arm64` are supported; there are no universal builds.

Outputs are in **`desktop/release/`**:

| Platform | Outputs (version comes from `server/package.json`) |
| --- | --- |
| macOS | `mac[-arm64]/RSSMonster.app`, `RSSMonster-2.4.0-{x64,arm64}.dmg` |
| Windows | `RSSMonster-Setup-2.4.0-{x64,arm64}.exe` (NSIS installer), `RSSMonster-Portable-2.4.0-{x64,arm64}.exe` (portable launcher) |
| Linux | `RSSMonster-2.4.0-{x86_64,arm64}.AppImage`, `RSSMonster-2.4.0-{amd64,arm64}.deb` |

`dist/` remains the frontend build. `.stage/` is a disposable generated application
directory; neither is a second maintained frontend/backend. Build outputs are ignored
by Git. Signing, notarization and electron-builder publishing are explicitly disabled.

### GitHub releases

After committing the desktop files and version changes, push a version tag such as
`v2.4.0`. `.github/workflows/desktop-release.yml` builds Windows x64, Linux x64,
macOS Intel and macOS Apple Silicon artifacts on native GitHub runners. Windows
produces both an installer and a portable executable. The tag
must match the client, server and inference package versions; desktop inherits the
server version. The workflow can also be run manually with an existing tag.

After every build and desktop runtime test succeeds, the workflow attaches the six desktop
artifacts to a **draft** GitHub Release. Review the downloads and publish the draft
to make them publicly available. Reruns can replace assets on that draft, but refuse
to modify an already published release. Uploads use the built-in `GITHUB_TOKEN`;
only the release job has `contents: write`. No additional publishing secret is needed.
Ordinary branch pushes do not create desktop releases. Installers remain unsigned.

### Packaging details

`package.js` invokes the existing client build, stages selected server source and
inference and Electron files as siblings, and derives its runtime manifest/version from the server
package. It seeds dependency resolution from the server and inference lockfiles, installs a
clean production dependency tree, then calls electron-builder. Install server
dependencies first so that lockfile exists. Neither development dependencies nor
native bindings in `server/node_modules` are changed by packaging.

Desktop pins Umzug 2.3.0 to match the existing shared migration runner API and the
server lockfile. The packaged dependency tree must retain that API compatibility.

The existing SQLite driver is `sqlite3` (currently 6.0.1), with a native Node-API
binding. `npmRebuild: true` lets electron-builder's standard `@electron/rebuild`
prepare it for the chosen Electron version/platform/architecture. Prebuilt bindings
are used where supported; otherwise the target OS needs its native build toolchain.
ASAR is enabled. SQLite bindings, ONNX Runtime native binaries and the Sharp native
packages are unpacked;
JavaScript, migrations, parser worker threads and static assets work inside ASAR.

Existing RSSMonster PNG branding is reused. electron-builder converts the 1024px
PNG to ICNS/ICO for macOS/Windows and uses the existing 512px PNG on Linux. No new
branding or manually maintained icon variants are required.

The staged layout preserves `import.meta.url` paths for the frontend and migrations;
launching never requires the repository as the working directory. One shared
feed-trust script's CLI guard also tolerates packaged launches without `argv[1]`.

The package excludes `.env`, local databases/logs, repository metadata, tests,
fixtures, documentation, development dependencies, models/caches, unrelated scripts
and the crawl worker entry point. It includes the shared inference source, AI worker, and crawl worker/pipeline
modules used by the Desktop-managed entry point, with their production dependencies. ONNX Runtime and Sharp use their
published Node-API binaries; build on the target OS for release verification.

## Data and lifecycle

Installed application data remains under Electron's `app.getPath('userData')`
(`RSSMonster`, normally `%APPDATA%\RSSMonster` on Windows):

- SQLite: `rssmonster.sqlite` and its SQLite sidecars.
- Authentication: persistent `secrets.json` (keep with database backups).
- Worker status: `ai-worker-health.json` and `crawl-worker-health.json`.
- Desktop preferences: `desktop-settings.json`.
- Models: `models/` (downloaded weights; reusable across restarts).
- Chromium profile/cache: Electron's user profile, outside the installed application.

Logs go to stdout/stderr; no application log files are written into the bundle.
Versioned artifacts do not change the profile name or database path. Pending existing
migrations run before the HTTP listener starts, without model sync or a seed command.
Desktop configures immediate SQLite write transactions in both the HTTP process
and managed AI/crawl workers to avoid deferred read-to-write lock conflicts. First-time users
register through the existing UI. Existing feed-level AI switches
and saved processing preferences are preserved; enable AI on existing feeds if
they were created with analysis or embeddings disabled.

Closing the window hides it by default when the native tray is available. Use
**Quit RSSMonster** in the tray to stop the application. Disabling tray continuation
restores close-to-exit. If tray creation fails, the window stays accessible and
closing it exits. Second-instance launches and tray Open restore the same window.

On quit, scheduled work stops first, the crawl child drains its current iteration,
accepted HTTP requests/manual crawls drain, then the AI worker and inference stop
and Sequelize closes. A managed child exceeding the existing 40-second drain
limit is terminated. Feed leases and crawl-run heartbeat recovery remain in effect.
No polling loop continues after shutdown. Parser worker threads remain unchanged.

## Background refresh and Desktop settings

**Settings → Background refresh** is available to the local administrator. Settings
live in `userData/desktop-settings.json` (portable: `data/desktop-settings.json`),
written atomically and retained across upgrades. They describe this Desktop profile,
not an individual user's article preferences. Other users can view their own
refresh results and AI activity, but cannot modify application lifecycle settings.

| Setting | Default | Behavior |
| --- | --- | --- |
| Automatically refresh feeds | On | Run the existing crawl worker after local AI services are ready. Manual refresh remains available when disabled. |
| Refresh interval | 15 minutes | Choose 5, 15, 30, or 60 minutes between completed cycles. Due-feed rules, `nextFetchAt`, leases, retries, and HTTP cache policy remain authoritative. |
| Continue running in system tray | On | Hide the window on close and keep all services running. |
| Launch RSSMonster when signing in | Off | Native Electron login item, supported for packaged Windows installations. |
| Start minimized to tray | Off | Hide the window on the next launch; requires tray continuation and an available tray. |

Desktop supplies its interval to `createCrawlWorker`, using its existing interruptible
sleep and `runSemanticPipeline`. It does not change `CRAWL_WORKER_INTERVAL_MS` or
Server settings for self-hosted workers. SQLite still forces sequential user/feed
processing and immediate write transactions. Manual REST refreshes and scheduled
cycles coordinate through the existing active-user crawl constraint and feed leases;
tray Refresh wakes the same child, or starts one bounded cycle when disabled.
Changing the interval wakes that loop; changing unrelated tray preferences does not.
Disabling automation drains the crawl child before acknowledging the change.
No independent timer fetches feeds, and no additional nightly archiving job is added.

The native tray and compact in-app indicator read real crawl runs, active processing
jobs, the critical-pipeline lease, and worker lifecycle messages. Feed crawling and
post-crawl/AI processing are distinct states. Last-refresh counts belong to the latest
recorded feed run, including cycles importing zero articles. Next refresh means the
next eligibility check, not a promise that each feed will fetch. There is no next
schedule while disabled, starting, running, or after a worker exit. Failed cycles
retain the existing retry interval when the worker remains alive. Hover for timestamps; use
Refresh history and AI Processing for details. Worker health files stay under userData.
A crawl-process exit shows an error and clears the schedule; explicit tray Refresh
retries it without an automatic restart storm. Inference/AI startup failures retain
the existing application shutdown behavior.

The renderer remains sandboxed and uses authenticated `/api/desktop/settings` and
`/api/desktop/activity` REST endpoints. Settings writes require the existing
administrator middleware. Activity counts/results are scoped to the logged-in user;
the native tray shows profile-wide activity. No renderer Node or preload API is added.

### Platform limitations

- Windows installers use Electron's native login-item APIs with one `RSSMonster`
  entry and reflect OS changes to its enabled state. This requires no administrator
  privileges. Start-minimized is read from the profile on each launch.
- Windows portable sign-in startup is disabled: launchers extract Electron to a
  temporary location and their original executable can move. No custom registry or
  shortcut workaround is installed. Portable storage and tray refresh remain supported.
- The current unsigned macOS builds do not offer sign-in startup; Electron requires
  signed/notarized builds for reliable registration. The menu-bar icon uses template
  rendering. Dock activation restores the window.
- Linux sign-in startup is left to the desktop environment. Tray availability and
  click behavior depend on its StatusNotifier/AppIndicator support. If native tray
  initialization fails, hide-on-close and start-minimized are unavailable.

### Windows portable

The portable artifact requires no installation. Put it in a writable folder (including
a USB drive), optionally rename it to `RSSMonster.exe`, and launch it:

```text
RSSMonster\
├── RSSMonster.exe
└── data\
    ├── rssmonster.sqlite
    ├── secrets.json
    └── models\
```

First launch creates `data/` recursively before any application state is initialized.
The existing runtime creates the database and persistent secrets, runs migrations,
and downloads all three models into `data/models/`. Additional Chromium files such
as `Cache/` and `Local Storage/`, worker health, `logs/` and `Crashpad/` may appear
under `data/`. Portable startup fails with an error dialog if storage is not writable;
it never falls back to AppData. Installed profiles are not moved or imported.

Detection uses electron-builder's `PORTABLE_EXECUTABLE_DIR`, restricted to packaged
Windows launches. The launcher sets this to its original `$EXEDIR` before starting
Electron from a temporary extraction directory. Storage uses that original directory,
independent of working directory, shortcuts, executable name, and extraction path.
Before Electron's ready event and single-instance lock, `storage.js` creates/probes
the directory and redirects `userData`, `sessionData`, logs and crash dumps into it.
The runtime receives the same data root through its existing interface.

Close RSSMonster fully before copying or moving its complete folder, including
`data/`. Keep database and secrets together to preserve accounts/authentication.
To upgrade, quit the app fully and replace only `RSSMonster.exe`; preserve `data/`.
Migrations run normally on the next launch. The launcher temporarily extracts
application binaries to Windows' temp directory and removes them on normal exit;
persistent RSSMonster state stays beside the launcher.

## Verify

```sh
npm test --prefix desktop
npm run test:electron --prefix desktop
npm run lint --prefix desktop
npm run test:packaged --prefix desktop
# Test the Linux AppImage itself (path is relative to desktop/):
npm run test:packaged --prefix desktop -- release/RSSMonster-2.4.0-x86_64.AppImage
# On Windows, verify the actual portable launcher from a disposable folder:
npm run test:packaged --prefix desktop -- release/RSSMonster-Portable-2.4.0-x64.exe --portable
```

The packaged verifier supports Linux and Windows. It uses disposable profiles outside
the repository and a local fixture feed, checks ordinary startup on Linux, then tests Vue login/refresh, REST, SQLite persistence across restarts,
local AI readiness, disabled Assistant and clean window/HTTP shutdown. Debugging is enabled only on its
test launches; it adds no test hooks to the shipped application. A graphical session
and normal Electron host libraries are required. On systems without FUSE, the test
uses AppImage's supported extract-and-run mode and closes it through the UI.
The Electron/package smoke tests download models into temporary profiles by default.
Set `RSSMONSTER_TEST_MODEL_CACHE` to an existing absolute model-cache directory to
reuse weights through a test-only link. Production always uses `userData/models`
(portable: `data/models`). Portable verification copies the artifact into a temporary
folder with spaces, launches from another working directory, moves the folder
between launches, verifies the existing JWT/database/secrets and checks that no
AppData profile is created. Omit the model-cache override to exercise a completely
clean first launch with model downloads. Storage unit tests always cover clean
recursive creation, reuse, unwritable storage and early Electron path configuration.

Local AI has been tested with Linux x64/WSL2, the AppImage, and the packaged
Windows x64 executable on Windows 11, using disposable profiles and cached models.
Windows NSIS packaging succeeds from WSL2 with Wine. Installer UI and macOS runtime
verification remain separate. GitHub runner
execution is only verified after the release workflow runs successfully.
This environment needed NSS/NSPR/ALSA libraries supplied temporarily for testing;
normal target systems must supply Electron's runtime libraries. Never disable the
sandbox as an installation workaround.

## Limits and deferred work

Binaries are unsigned; platform trust warnings are expected. The loopback port
changes on restart, so origin-scoped browser caches/storage can accumulate or reset.
External navigation/new windows/executable frames are blocked; publisher images and
media remain ordinary RSS reader content.

Deferred: automatic release publication, auto-update/update servers, Apple
signing/notarization, Windows signing, crash reporting, telemetry, tray mode,
notifications, OS/protocol integrations and background crawling.

### Background refresh validation

`npm test --prefix desktop` covers settings persistence, manager/tray behavior,
packaging completeness, and a real multi-process SQLite crawl fixture without a
window. `npm run test:tray --prefix desktop` additionally uses native Electron,
the rendered Settings navigation, and a managed utility crawler with disposable
storage. It needs a built frontend and a GUI/tray session but no model download.
The existing `test:electron` and `test:packaged` checks still cover local AI readiness,
enrichment, manual refresh, persistence, and shutdown. Packaged persistence checks
explicitly choose close-to-exit mode; ordinary users retain the tray default.
