# RSSMonster Desktop

Electron runs the existing Express backend and Vue frontend over loopback HTTP.
Desktop uses SQLite, manual feed refresh only, no worker process, no scheduled
crawling, and no inference/AI functionality. The self-hosted distribution is unchanged.

## Develop

Use Node.js >=22.19.0 and npm on the OS where Electron will run. From the repository
root, install the existing packages (skip packages already installed):

```sh
npm install --prefix client
npm install --prefix server
npm ci --prefix desktop
npm run desktop --prefix desktop
```

There is no root npm package or workspace. Equivalently, `cd desktop` and run
`npm run desktop`. This builds Vue into `desktop/dist` with same-origin `/api`
requests, then starts Electron. `npm start --prefix desktop` reuses that build.
Restart after server changes; rebuild after client changes. No preload or IPC API.

## Build installable artifacts

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
| macOS | `mac[-arm64]/RSSMonster.app`, `RSSMonster-2.3.0-{x64,arm64}.dmg` |
| Windows | `RSSMonster-Setup-2.3.0-{x64,arm64}.exe` (NSIS) |
| Linux | `RSSMonster-2.3.0-{x86_64,arm64}.AppImage`, `RSSMonster-2.3.0-{amd64,arm64}.deb` |

`dist/` remains the frontend build. `.stage/` is a disposable generated application
directory; neither is a second maintained frontend/backend. Build outputs are ignored
by Git. Signing, notarization and electron-builder publishing are explicitly disabled.

### GitHub releases

After committing the desktop files and version changes, push a version tag such as
`v2.3.0`. `.github/workflows/desktop-release.yml` builds Windows x64, Linux x64,
macOS Intel and macOS Apple Silicon installers on native GitHub runners. The tag
must match the client, server and inference package versions; desktop inherits the
server version. The workflow can also be run manually with an existing tag.

After every build and desktop runtime test succeeds, the workflow attaches the five
installers to a **draft** GitHub Release. Review the downloads and publish the draft
to make them publicly available. Reruns can replace assets on that draft, but refuse
to modify an already published release. Uploads use the built-in `GITHUB_TOKEN`;
only the release job has `contents: write`. No additional publishing secret is needed.
Ordinary branch pushes do not create desktop releases. Installers remain unsigned.

### Packaging details

`package.js` invokes the existing client build, stages selected server source and
Electron files as siblings, and derives its runtime manifest/version from the server
package. It seeds dependency resolution from `server/package-lock.json`, installs a
clean production dependency tree, then calls electron-builder. Install server
dependencies first so that lockfile exists. Neither development dependencies nor
native bindings in `server/node_modules` are changed by packaging.

The existing SQLite driver is `sqlite3` (currently 6.0.1), with a native Node-API
binding. `npmRebuild: true` lets electron-builder's standard `@electron/rebuild`
prepare it for the chosen Electron version/platform/architecture. Prebuilt bindings
are used where supported; otherwise the target OS needs its native build toolchain.
ASAR is enabled. Only `node_modules/sqlite3/build/Release/*.node` is unpacked;
JavaScript, migrations, parser worker threads and static assets work inside ASAR.

Existing RSSMonster PNG branding is reused. electron-builder converts the 1024px
PNG to ICNS/ICO for macOS/Windows and uses the existing 512px PNG on Linux. No new
branding or manually maintained icon variants are required.

The staged layout preserves `import.meta.url` paths for the frontend and migrations;
launching never requires the repository as the working directory. One shared
feed-trust script's CLI guard also tolerates packaged launches without `argv[1]`.

The package excludes `.env`, local databases/logs, repository metadata, tests,
fixtures, documentation, development dependencies, unrelated scripts, worker entry
points and the entire standalone inference service/models. It retains the two scripts
imported by controllers, three worker-health helpers imported by status services,
and taxonomy constants imported by a migration. These are shared code, not running
workers or seeds. Server-side inference client/SDK imports remain because the existing
Express routes import them, but inference is disabled before any server import.

## Data and lifecycle

Application data remains under Electron's `app.getPath('userData')` (`RSSMonster`):

- SQLite: `rssmonster.sqlite` and its SQLite sidecars.
- Authentication: persistent `secrets.json` (keep with database backups).
- Chromium profile/cache: Electron's user profile, outside the installed application.

Logs go to stdout/stderr; no application log files are written into the bundle.
Versioned artifacts do not change the profile name or database path. Pending existing
migrations run before the HTTP listener starts, without model sync or a seed command.
First-time users register through the existing UI.

Closing the final window exits on all platforms. The listener stops, accepted
requests/manual crawls drain, and Sequelize closes before Electron exits. Active
crawls may delay quitting until their existing deadlines settle. Existing short-lived
parser worker **threads** remain for timeout/memory isolation; crawler/AI worker
**processes** never start. Frontend database polling and its PWA service worker do
not schedule feed crawling.

## Verify

```sh
npm test --prefix desktop
npm run test:electron --prefix desktop
npm run lint --prefix desktop
npm run test:packaged --prefix desktop
# Test the Linux AppImage itself (path is relative to desktop/):
npm run test:packaged --prefix desktop -- release/RSSMonster-2.3.0-x86_64.AppImage
```

The packaged verifier currently targets Linux. It uses disposable profiles outside
the repository and a local fixture feed, checks the installed executable with no arguments and default
userData, then tests Vue login/refresh, REST, SQLite persistence across restarts,
disabled inference and clean window/HTTP shutdown. Debugging is enabled only on its
test launches; it adds no test hooks to the shipped application. A graphical session
and normal Electron host libraries are required. On systems without FUSE, the test
uses AppImage's supported extract-and-run mode and closes it through the UI.

Tested here: Linux x64/WSL2, including AppImage and the binary extracted from the
`.deb`. Windows x64 NSIS packaging also succeeded from WSL2 with Wine; Windows
installation/runtime and macOS builds have not been tested locally. GitHub runner
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
notifications, OS/protocol integrations, background crawling, inference and worker
services.
