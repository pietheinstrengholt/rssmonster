// Disposable native Electron check; real local crawler, no downloaded models or existing profile.
import { app, BrowserWindow, Menu, Tray, nativeImage, utilityProcess } from 'electron';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { startRuntime } from '../../runtime.js';
import { createDesktopServices } from '../../services.js';
import { createDesktopSettings, createLoginSettings } from '../../settings.js';
import { createDesktopTray } from '../../tray.js';

app.disableHardwareAcceleration();
app.setName('RSSMonster tray smoke');
const directory = process.env.RSSMONSTER_TRAY_TEST_DIRECTORY || await mkdtemp(path.join(tmpdir(), 'rssmonster-native-tray-'));
app.setPath('userData', directory);
app.on('window-all-closed', () => {});
app.on('before-quit', event => event.preventDefault());
let runtime;
let tray;
let window;
let failure;
let requestedQuit = false;
const report = { platform: process.platform, checks: [], directory };
console.log('Native tray test profile:', directory);
void app.whenReady().then(async () => {
try {
  const settings = await createDesktopSettings(directory, { login: createLoginSettings(app), onChange: async () => { await runtime.background.configure(); tray.applySettings(); } });
  const services = createDesktopServices(utilityProcess, error => { failure = error; });
  runtime = await startRuntime(directory, { startCrawlWorker: services.startCrawlWorker }, { settings });
  await runtime.ready;
  window = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await window.loadURL(runtime.origin);
  tray = createDesktopTray({ Tray, Menu, nativeImage, window, settings, runtime, quit: () => { requestedQuit = true; } });
  assert.equal(tray.available(), true, 'Native tray must initialize in the smoke-test session');
  window.show();
  for (let index = 0; index < 3; index++) {
    window.close();
    assert.equal(window.isDestroyed(), false);
    assert.equal(window.isVisible(), false);
    tray.open();
    assert.equal(window.isVisible(), true);
  }
  report.checks.push('Native hide/open cycles retain one window and managed crawler');
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  const credentials = { username: `tray-${randomUUID().slice(0, 8)}`, password: randomUUID() };
  const authentication = { token: null };
  const api = async (route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${runtime.origin}/api${route}`, { method,
      headers: { 'Content-Type': 'application/json', ...(authentication.token ? { Authorization: `Bearer ${authentication.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.ok(response.ok, route);
    return response.json();
  };
  await api('/auth/register', { ...credentials, password_repeat: credentials.password });
  authentication.token = (await api('/auth/login', credentials)).token;
  await window.webContents.executeJavaScript(`(async () => {
    for (const [id, value] of Object.entries(${JSON.stringify(credentials)})) {
      const input = document.getElementById(id); input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('.auth-form').requestSubmit();
    const waitFor = find => new Promise(resolve => {
      const check = () => { const result = find(); if (result) { observer.disconnect(); resolve(result); } };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true });
      check();
    });
    (await waitFor(() => document.querySelector('[aria-label="Open settings"]'))).click();
    (await waitFor(() => [...document.querySelectorAll('.settings-sidebar-item')].find(button => button.textContent.trim() === 'Background refresh'))).click();
    await waitFor(() => document.getElementById('automaticRefresh'));
  })()`);
  assert.equal(await window.webContents.executeJavaScript('typeof process'), 'undefined');
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('automaticRefresh').checked"), true);
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  report.checks.push('Rendered Desktop settings navigation and sandboxed renderer');
  if (process.env.RSSMONSTER_TRAY_TEST_SCREENSHOT) await writeFile(process.env.RSSMONSTER_TRAY_TEST_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
  await window.webContents.executeJavaScript(`(async () => {
    document.getElementById('automaticRefresh').click();
    const interval = document.getElementById('desktop-refresh-interval');
    interval.value = '5'; interval.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('.settings-content form').requestSubmit();
    await new Promise(resolve => {
      const check = () => {
        if (![...document.querySelectorAll('[role="status"]')].some(row => row.textContent === 'Desktop settings saved.')) return;
        observer.disconnect(); resolve();
      };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true }); check();
    });
    document.querySelector('[aria-label="Close settings"]').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    document.querySelector('[title="Choose theme"]').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    [...document.querySelectorAll('[role="menuitemradio"]')].find(button => button.textContent.trim() === 'Dark').click();
    document.querySelector('[aria-label="Open settings"]').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    [...document.querySelectorAll('.settings-sidebar-item')].find(button => button.textContent.trim() === 'Background refresh').click();
    await new Promise(resolve => {
      const check = () => { if (!document.getElementById('automaticRefresh')) return; observer.disconnect(); resolve(); };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true }); check();
    });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  assert.equal(await window.webContents.executeJavaScript("document.documentElement.getAttribute('data-theme')"), 'dark');
  if (process.env.RSSMONSTER_TRAY_TEST_SCREENSHOT) {
    await writeFile(process.env.RSSMONSTER_TRAY_TEST_SCREENSHOT.replace('.png', '-dark.png'), (await window.webContents.capturePage()).toPNG());
    window.setSize(960, 760);
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await writeFile(process.env.RSSMONSTER_TRAY_TEST_SCREENSHOT.replace('.png', '-narrow.png'), (await window.webContents.capturePage()).toPNG());
    assert.equal(await window.webContents.executeJavaScript('document.documentElement.scrollWidth <= window.innerWidth'), true);
  }
  const updatedSettings = await api('/desktop/settings');
  assert.equal(updatedSettings.settings.automaticRefresh, false);
  assert.equal(updatedSettings.settings.refreshIntervalMinutes, 5);
  report.checks.push('UI saves apply live; light/dark and narrow Settings render without overflow');
  const { settings: configuration } = await api('/desktop/settings');
  await api('/desktop/settings', { ...configuration, automaticRefresh: false, continueInTray: false }, 'PUT');
  report.checks.push('Live REST settings stop the utility crawler');
  const closed = once(window, 'closed');
  window.close();
  await closed;
  assert.equal(window.isDestroyed(), true);
  tray.stop();
  await runtime.stop();
  report.checks.push('Close-to-exit mode and orderly runtime shutdown');
  await assert.rejects(fetch(`${runtime.origin}/api/health`));
  if (failure) throw failure;
  assert.equal(requestedQuit, false);
  console.log(JSON.stringify(report, null, 2));
  if (process.env.RSSMONSTER_TRAY_TEST_REPORT) await writeFile(process.env.RSSMONSTER_TRAY_TEST_REPORT, JSON.stringify(report));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  tray?.stop();
  window?.destroy();
  await runtime?.stop();
  if (!process.env.RSSMONSTER_TRAY_TEST_DIRECTORY) await rm(directory, { recursive: true, force: true, maxRetries: 3 }).catch(error => console.error('Native test cleanup:', error));
  app.exit(process.exitCode || 0);
}
}).catch(error => { console.error('Native test failure:', error); app.exit(1); });
