import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DESKTOP_DEFAULTS = Object.freeze({
  automaticRefresh: true, refreshIntervalMinutes: 15, continueInTray: true,
  launchAtLogin: false, startMinimized: false
});
export const REFRESH_INTERVALS = Object.freeze([5, 15, 30, 60]);

export const validateDesktopSettings = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).length !== Object.keys(DESKTOP_DEFAULTS).length ||
    Object.keys(input).some(key => !Object.hasOwn(DESKTOP_DEFAULTS, key)) ||
    Object.keys(DESKTOP_DEFAULTS).some(key => key !== 'refreshIntervalMinutes' && typeof input[key] !== 'boolean') ||
    !REFRESH_INTERVALS.includes(input.refreshIntervalMinutes)) {
    throw new Error('Provide valid Desktop settings and a refresh interval of 5, 15, 30, or 60 minutes.');
  }
  if (input.startMinimized && !input.continueInTray) throw new Error('Start minimized requires continuing in the system tray.');
  return { ...input };
};

export const createDesktopSettings = async (directory, { login, trayAvailable = () => true, onChange = async () => {} } = {}) => {
  const file = path.join(directory, 'desktop-settings.json');
  let settings;
  try { settings = validateDesktopSettings(JSON.parse(await readFile(file, 'utf8'))); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read Desktop settings. Restore desktop-settings.json from a backup or correct its values.', { cause: error });
    settings = { ...DESKTOP_DEFAULTS };
  }
  let saving = Promise.resolve();
  const get = () => ({
    settings: { ...settings, launchAtLogin: login?.supported ? login.get() : false,
      ...(!trayAvailable() ? { continueInTray: false, startMinimized: false } : {}) },
    capabilities: { login: Boolean(login?.supported), loginReason: login?.reason || '', tray: trayAvailable() }
  });
  const update = input => {
    const operation = saving.then(async () => {
      const next = validateDesktopSettings(input);
      if (next.launchAtLogin && !login?.supported) throw new Error(login?.reason || 'Launch at sign-in is unavailable.');
      if ((next.continueInTray || next.startMinimized) && !trayAvailable()) throw new Error('The system tray is unavailable in this desktop session.');
      const previousLogin = login?.supported ? login.get() : false;
      try {
        if (login?.supported && next.launchAtLogin !== previousLogin) login.set(next.launchAtLogin);
        await writeFile(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      } catch (error) {
        if (login?.supported && login.get() !== previousLogin) login.set(previousLogin);
        throw error;
      }
      settings = next;
      await onChange(get().settings);
      return get();
    });
    saving = operation.catch(() => {});
    return operation;
  };
  return { get, update };
};

// Portable launchers move and extract Electron to a temporary path. Never register that path.
export const createLoginSettings = (app, { platform = process.platform, environment = process.env } = {}) => {
  let reason = '';
  if (!app.isPackaged) reason = 'Launch at sign-in is unavailable in development builds.';
  else if (platform === 'win32' && environment.PORTABLE_EXECUTABLE_DIR) reason = 'Launch at sign-in is unavailable for portable builds. Their executable location can change.';
  else if (platform === 'darwin') reason = 'Launch at sign-in requires a signed and notarized macOS build; these releases are unsigned.';
  else if (platform !== 'win32') reason = 'Launch at sign-in is unavailable on this platform. Use your desktop environment’s startup settings.';
  const options = { path: process.execPath, args: [], name: 'RSSMonster' };
  return {
    supported: !reason, reason,
    get: () => app.getLoginItemSettings(options).openAtLogin,
    set: enabled => {
      app.setLoginItemSettings({ ...options, openAtLogin: enabled, enabled });
      if (app.getLoginItemSettings(options).openAtLogin !== enabled) throw new Error('The operating system did not apply the sign-in setting.');
    }
  };
};
