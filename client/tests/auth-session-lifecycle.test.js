import axios from 'axios';
import Cookies from 'js-cookie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import api, { setAuthToken } from '../src/api/client.js';
import * as authApi from '../src/api/auth';

vi.mock('../src/api/auth', () => ({
  applyAuthToken: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  validateSession: vi.fn()
}));

// This function creates the component state needed by authentication methods.
const createAuthContext = () => ({
  isAuthenticated: false,
  message: 'old message',
  password: 'secret',
  password_repeat: 'secret',
  showSignup: true,
  username: 'reader',
  $store: {
    auth: {
      setAgenticFeaturesEnabled: vi.fn(),
      setRole: vi.fn(),
      setToken: vi.fn()
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  setAuthToken(null);
});

describe('authentication lifecycle', () => {
  it('validates a saved session and applies its role and token', async () => {
    vi.spyOn(Cookies, 'get').mockReturnValue('saved-token');
    authApi.validateSession.mockResolvedValue({ user: { role: 'admin' } });
    const context = createAuthContext();

    await App.methods.checkSession.call(context);

    expect(authApi.validateSession).toHaveBeenCalledWith('saved-token');
    expect(authApi.applyAuthToken).toHaveBeenCalledWith('saved-token');
    expect(context.$store.auth.setToken).toHaveBeenCalledWith('saved-token');
    expect(context.$store.auth.setRole).toHaveBeenCalledWith('admin');
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

  it('clears store, cookie, and every Authorization default during logout', () => {
    const context = createAuthContext();
    const removeCookie = vi.spyOn(Cookies, 'remove').mockImplementation(() => {});
    setAuthToken('active-token');
    axios.defaults.headers.common.Authorization = 'Bearer stale-bootstrap-token';

    expect(api.defaults.headers.common.Authorization).toBe('Bearer active-token');
    expect(axios.defaults.headers.common.Authorization).toBe('Bearer stale-bootstrap-token');

    App.methods.logout.call(context);

    expect(api.defaults.headers.common.Authorization).toBeUndefined();
    expect(axios.defaults.headers.common.Authorization).toBeUndefined();
    expect(context.$store.auth.setToken).toHaveBeenCalledWith(null);
    expect(context.$store.auth.setRole).toHaveBeenCalledWith(null);
    expect(removeCookie).toHaveBeenCalledWith('token');
    expect(context.isAuthenticated).toBe(false);
    expect(context.username).toBe('');
    expect(context.password).toBe('');
  });
});
