import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../src/api/client.js';
import {
  developmentLogin,
  exchangeOidcCode,
  linkOidcAccount,
  validateSession
} from '../src/api/auth.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete api.defaults.headers.common.Authorization;
  delete axios.defaults.headers.common.Authorization;
});

describe('session validation API', () => {
  it('scopes the bootstrap Authorization header to the validation request', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { user: { role: 'user' } }
    });

    await expect(validateSession('saved-token')).resolves.toEqual({
      user: { role: 'user' }
    });

    expect(post).toHaveBeenCalledWith(
      '/auth/validate',
      undefined,
      {
        headers: {
          Authorization: 'Bearer saved-token'
        },
        suppressGlobalError: true
      }
    );
    expect(api.defaults.headers.common.Authorization).toBeUndefined();
    expect(axios.defaults.headers.common.Authorization).toBeUndefined();
  });

  it('rejects validation without a token before making a request', async () => {
    const post = vi.spyOn(api, 'post');

    await expect(validateSession()).rejects.toThrow('No token');
    expect(post).not.toHaveBeenCalled();
  });

  it('requests development login without credentials or global error handling', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { token: 'development-token' }
    });

    await expect(developmentLogin()).resolves.toEqual({
      token: 'development-token'
    });
    expect(post).toHaveBeenCalledWith(
      '/auth/development-login',
      undefined,
      { suppressGlobalError: true }
    );
  });
});


it('includes browser credentials only on OIDC handoff and linking requests', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { accepted: true } });
  await exchangeOidcCode('handoff-code');
  await linkOidcAccount('current-password');
  expect(post).toHaveBeenNthCalledWith(1, '/auth/oidc/exchange', { code: 'handoff-code' }, { suppressGlobalError: true, withCredentials: true });
  expect(post).toHaveBeenNthCalledWith(2, '/auth/oidc/link', { password: 'current-password' }, { suppressGlobalError: true, withCredentials: true });
  expect(api.defaults.withCredentials).not.toBe(true);
});
