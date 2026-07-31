import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../src/store/auth.js';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('authentication store state', () => {
  it('starts logged out', () => {
    const store = useAuthStore();

    expect(store.token).toBeNull();
    expect(store.role).toBeNull();
  });

  it('transitions authentication state and resets it safely', () => {
    const store = useAuthStore();

    store.setSession({
      token: 'session-token',
      role: 'admin'
    });

    expect(store.token).toBe('session-token');
    expect(store.role).toBe('admin');

    store.clearSession();

    expect(store.token).toBeNull();
    expect(store.role).toBeNull();
  });
});
