import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('active Island capacity configuration', () => {
  it.each([
    [undefined, 20], ['20', 20], ['30', 30], [' 30 ', 30], ['1', 1], ['1000', 1000],
    ['', 20], ['invalid', 20], ['0', 20], ['-1', 20], ['NaN', 20], ['Infinity', 20],
    ['20islands', 20], ['30.5', 20], ['0x20', 20], ['1e2', 20], ['1001', 20], ['9007199254740992', 20]
  ])('%j resolves to %i', async (value, expected) => {
    vi.stubEnv('MAX_INTEREST_ISLANDS', value);
    vi.resetModules();
    const { DEFAULT_MAX_ISLANDS_PER_USER, resolveIslandCapacity } = await import('../../services/islands/islandVectorUtils.js');
    expect(DEFAULT_MAX_ISLANDS_PER_USER).toBe(expected);
    expect(resolveIslandCapacity()).toBe(expected);
    expect(resolveIslandCapacity(2000)).toBe(expected);
    expect(resolveIslandCapacity(1)).toBe(1);
  });
});
