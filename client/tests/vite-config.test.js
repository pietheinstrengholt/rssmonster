import { afterEach, describe, expect, it, vi } from 'vitest';
import configuration from '../vite.config.js';

afterEach(() => vi.unstubAllEnvs());

describe('client base URL', () => {
  it('defaults to the root path without a configured base URL', () => {
    vi.stubEnv('VITE_BASE_URL', undefined);
    expect(configuration({ mode: 'test' }).base).toBe('/');
  });

  it('uses an explicitly configured base URL', () => {
    vi.stubEnv('VITE_BASE_URL', '/reader/');
    expect(configuration({ mode: 'test' }).base).toBe('/reader/');
  });
});
