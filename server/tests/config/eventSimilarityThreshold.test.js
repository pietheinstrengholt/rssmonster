import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Event similarity threshold configuration', () => {
  it.each([
    [undefined, 0.84],
    ['', 0.84],
    ['0.87', 0.87],
    ['0', 0]
  ])('preserves the configured default for EVENT_SIM_THRESHOLD=%s', async (configured, expected) => {
    vi.stubEnv('EVENT_SIM_THRESHOLD', configured);
    vi.resetModules();
    const { EVENT_SIM_THRESHOLD, getEventSimilarityThreshold } = await import('../../services/config/semanticConfig.js');
    expect(EVENT_SIM_THRESHOLD).toBe(expected);
    expect(getEventSimilarityThreshold(null)).toBe(expected);
    expect(getEventSimilarityThreshold(undefined)).toBe(expected);
    expect(getEventSimilarityThreshold('aggressive')).toBe(0.78);
    expect(getEventSimilarityThreshold('moderate')).toBe(0.84);
    expect(getEventSimilarityThreshold('conservative')).toBe(0.89);
  });
});
