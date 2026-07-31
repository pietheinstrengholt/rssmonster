import axios from 'axios';
import Cookies from 'js-cookie';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import api, { setAuthToken } from '../src/api/client.js';
import * as authApi from '../src/api/auth';
import { useAuthStore } from '../src/store/auth.js';

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

// This function creates an authentication response controlled by the session-transition test.
const deferred = () => {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  setAuthToken(null);
});

describe('authentication lifecycle', () => {
  it('owns one session-expiry listener and removes it on unmount', async () => {
    const context = {
      checkSession: vi.fn().mockResolvedValue(),
      handleAuthExpired: vi.fn(),
      isLoading: true
    };

    await App.created.call(context);
    await App.created.call(context);
    window.dispatchEvent(new Event('auth:expired'));

    expect(context.handleAuthExpired).toHaveBeenCalledOnce();
    expect(context.isLoading).toBe(false);

    App.beforeUnmount.call(context);
    window.dispatchEvent(new Event('auth:expired'));
    expect(context.handleAuthExpired).toHaveBeenCalledOnce();
  });

  it('validates a saved session and applies its role and token', async () => {
    vi.spyOn(Cookies, 'get').mockReturnValue('saved-token');
    authApi.validateSession.mockResolvedValue({
      user: { role: 'admin' }
    });
    const context = createAuthContext();

    await App.methods.checkSession.call(context);

    expect(authApi.validateSession).toHaveBeenCalledWith('saved-token');
    expect(authApi.applyAuthToken).toHaveBeenCalledWith('saved-token');
    expect(context.authStore.token).toBe('saved-token');
    expect(context.authStore.role).toBe('admin');
    expect(context.isAuthenticated).toBe(true);
  });

  it('populates the same auth feature state after login', async () => {
    vi.spyOn(Cookies, 'set').mockImplementation(() => {});
    authApi.login.mockResolvedValue({
      message: 'Connected!',
      token: 'login-token',
      expiresInSeconds: 86400,
      user: { role: 'user' }
    });
    const context = createAuthContext();

    await App.methods.login.call(context);

    expect(context.authStore.token).toBe('login-token');
    expect(context.authStore.role).toBe('user');
    expect(context.isAuthenticated).toBe(true);
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

  // This test verifies logout invalidates an outstanding session validation response.
  it('ignores session validation that resolves after logout', async () => {
    const oldValidation = deferred();
    vi.spyOn(Cookies, 'get').mockReturnValue('old-token');
    vi.spyOn(Cookies, 'remove').mockImplementation(() => {});
    authApi.validateSession.mockReturnValueOnce(oldValidation.promise);
    const context = createAuthContext();
    // This function exercises the same root cleanup used by production expiry and logout paths.
    context.logout = () => App.methods.logout.call(context);

    const validation = App.methods.checkSession.call(context);
    context.logout();
    oldValidation.resolve({ user: { role: 'admin' } });
    await validation;

    expect(authApi.applyAuthToken).not.toHaveBeenCalled();
    expect(context.authStore).toMatchObject({ token: null, role: null });
    expect(context.isAuthenticated).toBe(false);
  });

  // This test verifies a newer login supersedes validation still running for the previous user.
  it('keeps the new login when the previous session validation resolves last', async () => {
    const oldValidation = deferred();
    vi.spyOn(Cookies, 'get').mockReturnValue('old-token');
    vi.spyOn(Cookies, 'set').mockImplementation(() => {});
    authApi.validateSession.mockReturnValueOnce(oldValidation.promise);
    authApi.login.mockResolvedValueOnce({
      message: 'Connected!',
      token: 'new-token',
      expiresInSeconds: 86400,
      user: { role: 'admin' }
    });
    const context = createAuthContext();
    context.authStore.setSession({ token: 'old-token', role: 'user' });

    const oldRequest = App.methods.checkSession.call(context);
    await App.methods.login.call(context);
    oldValidation.resolve({ user: { role: 'user' } });
    await oldRequest;

    expect(context.authStore).toMatchObject({ token: 'new-token', role: 'admin' });
    expect(context.isAuthenticated).toBe(true);
    expect(authApi.applyAuthToken).not.toHaveBeenCalledWith('old-token');
  });

  it('clears store, cookie, and every Authorization default during logout', () => {
    const context = createAuthContext();
    const removeCookie = vi.spyOn(Cookies, 'remove').mockImplementation(() => {});
    context.authStore.setSession({
      token: 'active-token',
      role: 'admin'
    });
    setAuthToken('active-token');
    axios.defaults.headers.common.Authorization = 'Bearer stale-bootstrap-token';

    expect(api.defaults.headers.common.Authorization).toBe('Bearer active-token');
    expect(axios.defaults.headers.common.Authorization).toBe('Bearer stale-bootstrap-token');

    App.methods.logout.call(context);

    expect(api.defaults.headers.common.Authorization).toBeUndefined();
    expect(axios.defaults.headers.common.Authorization).toBeUndefined();
    expect(context.authStore.token).toBeNull();
    expect(context.authStore.role).toBeNull();
    expect(removeCookie).toHaveBeenCalledWith('token');
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBe('');
    expect(context.password).toBe('');
  });
});
