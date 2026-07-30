import axios from 'axios';
import Cookies from 'js-cookie';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import api, { setAuthToken } from '../src/api/client.js';
import * as authApi from '../src/api/auth';
import { useStore as useAuthStore } from '../src/store/auth.js';

vi.mock('../src/api/auth', () => ({
  applyAuthToken: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  validateSession: vi.fn()
}));

// This function creates the component state needed by authentication methods.
const createAuthContext = () => ({
  authStore: useAuthStore(),
  isAuthenticated: false,
  message: 'old message',
  password: 'secret',
  password_repeat: 'secret',
  showSignup: true,
  username: 'reader'
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  setAuthToken(null);
});

describe('authentication lifecycle', () => {
  it('validates a saved session and applies its role and token', async () => {
    vi.spyOn(Cookies, 'get').mockReturnValue('saved-token');
    authApi.validateSession.mockResolvedValue({
      user: { role: 'admin' },
      agenticFeaturesEnabled: true
    });
    const context = createAuthContext();

    await App.methods.checkSession.call(context);

    expect(authApi.validateSession).toHaveBeenCalledWith('saved-token');
    expect(authApi.applyAuthToken).toHaveBeenCalledWith('saved-token');
    expect(context.authStore.getToken).toBe('saved-token');
    expect(context.authStore.getRole).toBe('admin');
    expect(context.authStore.isAgenticFeaturesEnabled).toBe(true);
    expect(context.isAuthenticated).toBe(true);
  });

  it('populates the same auth feature state after login', async () => {
    vi.spyOn(Cookies, 'set').mockImplementation(() => {});
    authApi.login.mockResolvedValue({
      message: 'Connected!',
      token: 'login-token',
      expiresInSeconds: 86400,
      user: { role: 'user' },
      agenticFeaturesEnabled: true
    });
    const context = createAuthContext();

    await App.methods.login.call(context);

    expect(context.authStore.getToken).toBe('login-token');
    expect(context.authStore.getRole).toBe('user');
    expect(context.authStore.isAgenticFeaturesEnabled).toBe(true);
    expect(context.isAuthenticated).toBe(true);
  });

  it('uses the safe feature default when validation omits the flag', async () => {
    vi.spyOn(Cookies, 'get').mockReturnValue('saved-token');
    authApi.validateSession.mockResolvedValue({ user: { role: 'admin' } });
    const context = createAuthContext();
    context.authStore.setAgenticFeaturesEnabled(true);

    await App.methods.checkSession.call(context);

    expect(context.authStore.isAgenticFeaturesEnabled).toBe(false);
  });

  it('logs out when session validation fails or auth expiry is received', async () => {
    vi.spyOn(Cookies, 'get').mockReturnValue('expired-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    authApi.validateSession.mockRejectedValue(new Error('expired'));
    const logout = vi.fn();

    await App.methods.checkSession.call({ ...createAuthContext(), logout });
    App.methods.handleAuthExpired.call({ logout });

    expect(logout).toHaveBeenCalledTimes(2);
  });

  it('clears store, cookie, and every Authorization default during logout', () => {
    const context = createAuthContext();
    const removeCookie = vi.spyOn(Cookies, 'remove').mockImplementation(() => {});
    context.authStore.setSession({
      token: 'active-token',
      role: 'admin',
      agenticFeaturesEnabled: true
    });
    setAuthToken('active-token');
    axios.defaults.headers.common.Authorization = 'Bearer stale-bootstrap-token';

    expect(api.defaults.headers.common.Authorization).toBe('Bearer active-token');
    expect(axios.defaults.headers.common.Authorization).toBe('Bearer stale-bootstrap-token');

    App.methods.logout.call(context);

    expect(api.defaults.headers.common.Authorization).toBeUndefined();
    expect(axios.defaults.headers.common.Authorization).toBeUndefined();
    expect(context.authStore.getToken).toBeNull();
    expect(context.authStore.getRole).toBeNull();
    expect(context.authStore.isAgenticFeaturesEnabled).toBe(false);
    expect(removeCookie).toHaveBeenCalledWith('token');
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBe('');
    expect(context.password).toBe('');
  });
});
