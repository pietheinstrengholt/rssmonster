import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import api, { setAuthToken } from '../src/api/client.js';
import { useAuthStore } from '../src/store/auth.js';

beforeEach(() => {
  setActivePinia(createPinia());
  setAuthToken(null);
});

afterEach(() => {
  setAuthToken(null);
});

describe('API authentication ownership', () => {
  // Verifies the auth store configures the shared client before lazy feature code is evaluated.
  it('retains the authenticated client header while lazy features load', async () => {
    const authStore = useAuthStore();
    authStore.setSession({ token: 'session-token', role: 'admin', userId: 7 });

    await Promise.all([
      import('../src/components/dialogs/feeds/NewFeed.vue'),
      import('../src/components/settings/SettingsOfficialSources.vue')
    ]);

    expect(api.defaults.headers.common.Authorization).toBe('Bearer session-token');
    expect(authStore).toMatchObject({ token: 'session-token', role: 'admin', userId: 7 });
  });

  // Verifies every store-owned session transition updates or clears the client header atomically.
  it('updates the shared client when the authenticated session changes or ends', () => {
    const authStore = useAuthStore();

    authStore.setSession({ token: 'first-token', role: 'user', userId: 1 });
    authStore.setSession({ token: 'second-token', role: 'admin', userId: 2 });
    expect(api.defaults.headers.common.Authorization).toBe('Bearer second-token');

    authStore.clearSession();
    expect(api.defaults.headers.common.Authorization).toBeUndefined();
    expect(authStore.token).toBeNull();
  });
});
