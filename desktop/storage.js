import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const resolveDesktopStorage = (app, { platform = process.platform, environment = process.env } = {}) => {
  const executableDirectory = environment.PORTABLE_EXECUTABLE_DIR;
  const portable = app.isPackaged && platform === 'win32' && Boolean(executableDirectory);
  if (!portable) return { portable: false, dataDirectory: app.getPath('userData') };
  // electron-builder supplies the launcher's directory, not the extracted Electron executable's.
  if (!path.isAbsolute(executableDirectory)) throw new Error('Invalid portable executable directory: an absolute path is required.');
  return { portable: true, dataDirectory: path.join(executableDirectory, 'data') };
};

export const configureDesktopStorage = (app, options) => {
  const storage = resolveDesktopStorage(app, options);
  if (!storage.portable) return storage.dataDirectory;
  const { dataDirectory } = storage;
  try {
    mkdirSync(dataDirectory, { recursive: true });
    // Probe actual writes, including when an existing data directory is read-only.
    const probe = mkdtempSync(path.join(dataDirectory, '.write-test-'));
    try {
      writeFileSync(path.join(probe, 'probe'), '', { flag: 'wx' });
    } finally {
      rmSync(probe, { recursive: true, force: true });
    }
    const logs = path.join(dataDirectory, 'logs');
    const crashDumps = path.join(dataDirectory, 'Crashpad');
    mkdirSync(logs, { recursive: true });
    mkdirSync(crashDumps, { recursive: true });
    // These paths must be set synchronously before ready and the single-instance lock.
    app.setPath('userData', dataDirectory);
    app.setPath('sessionData', dataDirectory);
    app.setPath('crashDumps', crashDumps);
    app.setAppLogsPath(logs);
  } catch (cause) {
    throw new Error(`Portable RSSMonster requires a writable folder. Cannot initialize "${dataDirectory}". Move the RSSMonster folder to a writable location and try again.`, { cause });
  }
  return dataDirectory;
};
