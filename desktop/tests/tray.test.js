import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDesktopTray } from '../tray.js';
import { DESKTOP_DEFAULTS } from '../settings.js';

const fixture = () => {
  let configuration = { ...DESKTOP_DEFAULTS };
  const actions = [];
  const window = new EventEmitter();
  Object.assign(window, { isDestroyed: () => false, isMinimized: () => true,
    restore: () => actions.push('restore'), show: () => actions.push('show'), focus: () => actions.push('focus'), hide: () => actions.push('hide') });
  let menu;
  let icon;
  class Tray extends EventEmitter {
    constructor() { super(); icon = this; }
    setToolTip() {}
    setContextMenu(value) { menu = value; }
    destroy() { actions.push('destroy tray'); }
  }
  const settings = { get: () => ({ settings: configuration, capabilities: { login: true } }), update: async value => { configuration = value; } };
  const shell = createDesktopTray({ Tray, Menu: { buildFromTemplate: value => value },
    nativeImage: { createFromPath: () => ({ resize() { return this; }, isEmpty: () => false }) },
    window, settings, runtime: { getActivity: async () => ({ status: 'idle', lastRefreshAt: null, nextRefreshAt: null }), background: { refresh: async () => { actions.push('refresh'); } } },
    quit: () => actions.push('quit'), platform: 'win32'
  });
  return { shell, window, actions, getMenu: () => menu, icon: () => icon,
    setTray: value => { configuration = { ...configuration, continueInTray: value }; } };
};

test('repeated closes hide the same window; Open restores it and explicit Quit stays available', async () => {
  const { shell, window, actions, getMenu, icon } = fixture();
  try {
    for (let index = 0; index < 3; index++) {
      let prevented = false;
      window.emit('close', { preventDefault: () => { prevented = true; } });
      assert.equal(prevented, true);
      icon().emit('click');
    }
    assert.equal(actions.filter(value => value === 'hide').length, 3);
    assert.equal(actions.filter(value => value === 'show').length, 3);
    await Promise.resolve();
    getMenu().find(item => item.label === 'Refresh feeds now').click();
    await Promise.resolve(); await Promise.resolve();
    assert.ok(actions.includes('refresh'));
    getMenu().find(item => item.label === 'Quit RSSMonster').click();
    assert.ok(actions.includes('quit'));
  } finally { shell.stop(); }
  let prevented = false;
  window.emit('close', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
});

test('disabling the tray restores the window and preserves close-to-exit', () => {
  const { shell, window, actions, setTray } = fixture();
  try {
    setTray(false); shell.applySettings();
    assert.ok(actions.includes('show'));
    let prevented = false;
    window.emit('close', { preventDefault: () => { prevented = true; } });
    assert.equal(prevented, false);
  } finally { shell.stop(); }
});
