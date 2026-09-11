import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../services/ai/capabilities/generation.js', () => ({
  generateSmartFolderRecommendations: mocked.request
}));

const { getSmartFolderRecommendations } = await import(
  '../../services/smartFolders/smartFolderLLM.js'
);

describe('getSmartFolderRecommendations', () => {
  beforeEach(() => mocked.request.mockReset());

  it('delegates insights to inference', async () => {
    const insights = { interests: { topTags: ['ai'] } };
    const result = { smartFolders: [{ name: 'AI', query: 'ai', reason: 'Interest' }] };
    mocked.request.mockResolvedValue(result);
    await expect(getSmartFolderRecommendations({ insights })).resolves.toBe(result);
    expect(mocked.request).toHaveBeenCalledWith(
      { insights },
      {}
    );
  });
});
