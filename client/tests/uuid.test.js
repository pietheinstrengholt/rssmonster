import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from '../src/utils/uuid.js';

afterEach(() => vi.unstubAllGlobals());

describe('UUID generation', () => {
  it('uses the native method when available', () => {
    const uuid = '00000000-0000-4000-8000-000000000000';
    vi.stubGlobal('crypto', { randomUUID() { expect(this).toBe(crypto); return uuid; }, getRandomValues: vi.fn() });
    expect(randomUUID()).toBe(uuid);
    expect(crypto.getRandomValues).not.toHaveBeenCalled();
  });

  it.each([
    [0, '00000000-0000-4000-8000-000000000000'],
    [255, 'ffffffff-ffff-4fff-bfff-ffffffffffff']
  ])('generates a version 4 UUID from random bytes filled with %s', (value, expected) => {
    vi.stubGlobal('crypto', { getRandomValues: vi.fn(bytes => bytes.fill(value)) });
    expect(randomUUID()).toBe(expected);
    expect(crypto.getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
  });
});
