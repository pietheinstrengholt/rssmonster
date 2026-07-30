import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import { createStoreBridge } from '../src/store/index.js';
import { useStore as useAuthStore } from '../src/store/auth.js';
import { useStore as useDataStore } from '../src/store/data.js';
import mainSource from '../src/main.js?raw';

describe('Pinia store initialization', () => {
  it('creates the bridge once after installing Pinia', () => {
    const piniaInstallIndex = mainSource.indexOf('app.use(pinia)');
    const bridgeInitializationIndex = mainSource.indexOf(
      'createStoreBridge(pinia)'
    );

    expect(piniaInstallIndex).toBeGreaterThan(-1);
    expect(bridgeInitializationIndex).toBeGreaterThan(piniaInstallIndex);
    expect(mainSource.match(/createStoreBridge\(pinia\)/g)).toHaveLength(1);
    expect(mainSource).not.toContain('setStores');
  });

  it('creates both stores from the explicitly installed Pinia instance', () => {
    const pinia = createPinia();
    const bridge = createStoreBridge(pinia);

    expect(bridge.auth).toBe(useAuthStore(pinia));
    expect(bridge.data).toBe(useDataStore(pinia));
    expect(bridge.version).toBe('1.0.0');
  });

  it('keeps the compatibility bridge stable while its Pinia stores remain mutable', () => {
    const pinia = createPinia();
    const bridge = createStoreBridge(pinia);

    expect(Object.isFrozen(bridge)).toBe(true);

    bridge.auth.setSession({
      token: 'session-token',
      role: 'admin',
      agenticFeaturesEnabled: true
    });

    expect(bridge.auth.getToken).toBe('session-token');
    expect(bridge.auth.getRole).toBe('admin');
    expect(bridge.auth.isAgenticFeaturesEnabled).toBe(true);
  });
});
