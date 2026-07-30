import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/auth.js';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('authentication store state', () => {
  it('starts logged out with optional features disabled', () => {
    const store = useStore();

    expect(store.getToken).toBeNull();
    expect(store.getRole).toBeNull();
    expect(store.isAgenticFeaturesEnabled).toBe(false);
  });

  it('transitions authentication state and resets it safely', () => {
    const store = useStore();

    store.setSession({
      token: 'session-token',
      role: 'admin',
      agenticFeaturesEnabled: true
    });

    expect(store.getToken).toBe('session-token');
    expect(store.getRole).toBe('admin');
    expect(store.isAgenticFeaturesEnabled).toBe(true);

    store.clearSession();

    expect(store.getToken).toBeNull();
    expect(store.getRole).toBeNull();
    expect(store.isAgenticFeaturesEnabled).toBe(false);
  });

  it('defaults omitted session feature state to disabled', () => {
    const store = useStore();
    store.setAgenticFeaturesEnabled(true);

    store.setSession({
      token: 'validated-token',
      role: 'user'
    });

    expect(store.isAgenticFeaturesEnabled).toBe(false);
  });
});
