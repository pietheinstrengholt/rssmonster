import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateSession } from '../src/api/auth.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete axios.defaults.headers.common.Authorization;
});

describe('session validation API', () => {
  it('scopes the bootstrap Authorization header to the validation request', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { user: { role: 'user' } }
    });

    await expect(validateSession('saved-token')).resolves.toEqual({
      user: { role: 'user' }
    });

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/validate'),
      undefined,
      {
        headers: {
          Authorization: 'Bearer saved-token'
        }
      }
    );
    expect(axios.defaults.headers.common.Authorization).toBeUndefined();
  });

  it('rejects validation without a token before making a request', async () => {
    const post = vi.spyOn(axios, 'post');

    await expect(validateSession()).rejects.toThrow('No token');
    expect(post).not.toHaveBeenCalled();
  });
});
