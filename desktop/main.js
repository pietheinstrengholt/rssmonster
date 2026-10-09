import { app, BrowserWindow, dialog, Menu, Tray, nativeImage, session, utilityProcess } from 'electron';
import { startRuntime } from './runtime.js';
import { createDesktopServices } from './services.js';
import { createDesktopSettings, createLoginSettings } from './settings.js';
import { createDesktopTray } from './tray.js';
import { configureDesktopStorage } from './storage.js';

app.setName('RSSMonster');
let dataDirectory;
let storageError;
try {
  dataDirectory = configureDesktopStorage(app);
} catch (error) {
  storageError = error;
}
let runtime;
let startup;
let shuttingDown = false;
let tray;

const shutdown = async (exitCode = process.exitCode || 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  tray?.stop();
  try {
    await startup?.catch(() => {});
    BrowserWindow.getAllWindows().forEach(window => window.destroy());
    // Chromium can retain a refresh SSE connection after the last renderer closes.
    if (app.isReady()) await session.defaultSession.closeAllConnections();
    await runtime?.stop();
  } catch (error) {
    console.error('Desktop shutdown failed:', error);
    exitCode = 1;
  }
  app.exit(exitCode);
};

if (storageError) {
  console.error('Desktop startup failed:', storageError);
  dialog.showErrorBox('RSSMonster could not start', storageError.message);
  app.exit(1);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (tray) { tray.open(); return; }
    const window = BrowserWindow.getAllWindows()[0];
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.on('activate', () => tray?.open());
  app.on('before-quit', event => {
    event.preventDefault();
    void shutdown();
  });
  app.on('window-all-closed', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  startup = app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const settings = await createDesktopSettings(dataDirectory, {
      login: createLoginSettings(app),
      trayAvailable: () => Boolean(tray?.available()),
      onChange: async () => { await runtime?.background.configure(); tray?.applySettings(); }
    });
    runtime = await startRuntime(dataDirectory, createDesktopServices(utilityProcess, error => {
      console.error(error);
      void shutdown(1);
    }), { settings });
    if (shuttingDown) return;
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // The app shell and executable frames stay local; publisher images remain ordinary reader content.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const executable = ['mainFrame', 'subFrame', 'script', 'worker'].includes(details.resourceType);
      callback({ cancel: executable && new URL(details.url).origin !== runtime.origin });
    });
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== runtime.origin) event.preventDefault();
    });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    await window.loadURL(runtime.origin);
    if (!shuttingDown) {
      tray = createDesktopTray({ app, Tray, Menu, nativeImage, window, settings, runtime, quit: () => { void shutdown(); } });
      if (!settings.get().settings.startMinimized || !settings.get().settings.continueInTray || !tray.available()) window.show();
    }
    console.log(`RSSMonster desktop ready at ${runtime.origin}`);
    void runtime.ready.then(() => {
      if (!shuttingDown) {
        console.log('RSSMonster desktop AI ready');
        window.webContents.reload();
      }
    }).catch(error => {
      if (shuttingDown) return;
      console.error('Desktop AI startup failed:', error);
      void shutdown(1);
    });
  });
  void startup.catch(error => {
    console.error('Desktop startup failed:', error);
    // Consume the failed startup before entering the shared shutdown path.
    startup = Promise.resolve();
    void shutdown(1);
  });
}
