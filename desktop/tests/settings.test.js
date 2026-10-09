import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDesktopSettings, createLoginSettings, DESKTOP_DEFAULTS, validateDesktopSettings } from '../settings.js';

test('Desktop defaults and settings survive restart and apply live', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-desktop-settings-'));
  let osLogin = false;
  const login = { supported: true, get: () => osLogin, set: value => { osLogin = value; } };
  const changes = [];
  try {
    const store = await createDesktopSettings(directory, { login, onChange: settings => { changes.push(settings); } });
    assert.deepEqual(store.get().settings, DESKTOP_DEFAULTS);
    const saved = { ...DESKTOP_DEFAULTS, automaticRefresh: false, refreshIntervalMinutes: 30, launchAtLogin: true, startMinimized: true };
    await store.update(saved);
    assert.deepEqual(changes, [saved]);
    assert.equal(osLogin, true);
    const restarted = await createDesktopSettings(directory, { login });
    assert.deepEqual(restarted.get().settings, saved);
    osLogin = false; // Task Manager can disable the login item independently.
    assert.equal(restarted.get().settings.launchAtLogin, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid intervals, missing fields, and contradictory lifecycle settings are rejected', () => {
  for (const input of [{}, { ...DESKTOP_DEFAULTS, refreshIntervalMinutes: 1 }, { ...DESKTOP_DEFAULTS, extra: true },
    { ...DESKTOP_DEFAULTS, automaticRefresh: 'true' }, { ...DESKTOP_DEFAULTS, continueInTray: false, startMinimized: true }]) {
    assert.throws(() => validateDesktopSettings(input));
  }
});

test('unsupported login and missing tray cannot be enabled', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-desktop-options-'));
  try {
    const store = await createDesktopSettings(directory, { login: { supported: false, reason: 'Portable executable may move.' }, trayAvailable: () => false });
    assert.equal(store.get().settings.continueInTray, false);
    await assert.rejects(store.update({ ...DESKTOP_DEFAULTS, launchAtLogin: true }), /Portable/);
    await assert.rejects(store.update(DESKTOP_DEFAULTS), /tray/);
    await store.update({ ...DESKTOP_DEFAULTS, continueInTray: false });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('sign-in uses one stable native entry only for packaged Windows installations', () => {
  let registered = {};
  const app = { isPackaged: true, getLoginItemSettings: () => ({ openAtLogin: Boolean(registered.openAtLogin) }), setLoginItemSettings: value => { registered = value; } };
  const login = createLoginSettings(app, { platform: 'win32', environment: {} });
  assert.equal(login.supported, true);
  login.set(true);
  assert.equal(registered.name, 'RSSMonster');
  assert.equal(registered.path, process.execPath);
  assert.deepEqual(registered.args, []);
  login.set(false);
  assert.equal(login.get(), false);
  for (const [platform, environment] of [['win32', { PORTABLE_EXECUTABLE_DIR: 'C:\\Portable' }], ['darwin', {}], ['linux', {}]]) {
    assert.equal(createLoginSettings(app, { platform, environment }).supported, false);
  }
});
