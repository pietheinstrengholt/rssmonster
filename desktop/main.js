import { app, BrowserWindow, Menu, session, utilityProcess } from 'electron';
import { startRuntime } from './runtime.js';
import { createDesktopServices } from './services.js';

app.setName('RSSMonster');
let runtime;
let startup;
let shuttingDown = false;

const shutdown = async (exitCode = process.exitCode || 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on('before-quit', event => {
    event.preventDefault();
    void shutdown();
  });
  app.on('window-all-closed', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  startup = app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    runtime = await startRuntime(app.getPath('userData'), createDesktopServices(utilityProcess, error => {
      console.error(error);
      void shutdown(1);
    }));
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
    if (!shuttingDown) window.show();
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
