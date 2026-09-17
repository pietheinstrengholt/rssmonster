import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
const load = async value => {
  vi.stubEnv('ISLAND_INACTIVITY_DAYS', value);
  vi.resetModules();
  return import('../../services/islands/islandDeadline.js');
};

describe('Island inactivity deadline configuration', () => {
  it.each(['', '0', '-1', '29', '91', 'Infinity', '90days'])('defaults invalid %j to 90 days', async value => {
    expect((await load(value)).ISLAND_INACTIVITY_DAYS).toBe(90);
  });

  it.each([30, 45, 89.5, 90])('uses one %s-day deadline for every preference sign and strength', async days => {
    const { isActiveIsland, islandExpiresAt } = await load(String(days));
    const now = Date.parse('2026-09-17T00:00:00Z');
    for (const weight of [-1, -0.1, 0.1, 1]) {
      const island = { archivedInd: false, weight, lastBehaviorAt: new Date(now - days * 86400000) };
      expect(islandExpiresAt(island, now)).toEqual(new Date(now));
      expect(isActiveIsland(island, now)).toBe(false);
      expect(isActiveIsland(island, now - 1)).toBe(true);
    }
  });
});
