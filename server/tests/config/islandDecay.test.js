import { afterEach, describe, expect, it, vi } from 'vitest';

const fields = {
  lastClickedAt: ['ISLAND_CLICK_HALF_LIFE_DAYS', 30],
  lastMeaningfulReadAt: ['ISLAND_DEEP_READ_HALF_LIFE_DAYS', 90],
  favoritedAt: ['ISLAND_FAVORITE_HALF_LIFE_DAYS', 365],
  positiveFeedbackAt: ['ISLAND_POSITIVE_FEEDBACK_HALF_LIFE_DAYS', 730],
  negativeFeedbackAt: ['ISLAND_NEGATIVE_FEEDBACK_HALF_LIFE_DAYS', 365]
};
const defaults = Object.fromEntries(Object.entries(fields).map(([field, [, days]]) => [field, days]));
const load = async () => {
  vi.resetModules();
  return (await import('../../services/islands/islandVectorUtils.js')).SIGNAL_HALF_LIFE_DAYS;
};
const clear = () => Object.values(fields).forEach(([name]) => vi.stubEnv(name, ''));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Island decay configuration', () => {
  it('uses documented defaults and ignores the retired time-constant and floor options', async () => {
    clear();
    vi.stubEnv('ISLAND_RECENCY_HALF_LIFE_DAYS', '1');
    vi.stubEnv('ISLAND_RECENCY_MIN_WEIGHT', '1');
    expect(await load()).toEqual(defaults);
  });

  it.each(Object.entries(fields))('configures %s independently with positive fractional days', async (field, [name]) => {
    clear();
    vi.stubEnv(name, '45.5');
    expect(await load()).toEqual({ ...defaults, [field]: 45.5 });
  });

  it.each(['0', '-30', 'Infinity', 'NaN', '30days', ' ', 'invalid'])('falls back to per-signal defaults for invalid value %j', async value => {
    for (const [name] of Object.values(fields)) vi.stubEnv(name, value);
    expect(await load()).toEqual(defaults);
  });
});
