import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  buildInterestIslands: vi.fn()
}));

vi.mock('../services/islands/buildInterestIslands.js', () => ({
  buildInterestIslands: mocked.buildInterestIslands
}));

describe('buildInterestIslands script', () => {
  beforeEach(() => {
    mocked.buildInterestIslands.mockReset();
  });

  it('exposes the island pipeline for npm run islands', async () => {
    const { default: buildInterestIslands } = await import('../scripts/buildInterestIslands.js');

    await buildInterestIslands({ userId: 42 });

    expect(mocked.buildInterestIslands).toHaveBeenCalledWith({ userId: 42 });
  });
});
