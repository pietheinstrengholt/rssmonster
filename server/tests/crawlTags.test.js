import { describe, expect, it, vi } from 'vitest';

vi.mock('../models/index.js', () => ({
  default: {
    Tag: {
      create: vi.fn()
    }
  }
}));

describe('crawl tag helpers', () => {
  it('normalizes names and de-duplicates tag sources by priority', async () => {
    const { buildArticleTags } = await import('../controllers/crawl/tags.js');

    expect(buildArticleTags({
      generatedTags: ['Hardware', 'geekcomputerspcs', ''],
      feedTags: ['hardware', 'Security'],
      ruleTags: ['HARDWARE', 'Must Read']
    })).toEqual([
      { name: 'hardware', tagType: 'rule' },
      { name: 'geekcomputerspcs', tagType: 'generated' },
      { name: 'security', tagType: 'feed' },
      { name: 'must read', tagType: 'rule' }
    ]);
  });
});
