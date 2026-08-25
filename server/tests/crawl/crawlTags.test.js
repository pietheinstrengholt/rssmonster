import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  tagCreate: vi.fn(),
  tagDestroy: vi.fn(),
  tagFindAll: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Tag: {
      create: mocked.tagCreate,
      destroy: mocked.tagDestroy,
      findAll: mocked.tagFindAll
    }
  }
}));

describe('crawl tag helpers', () => {
  beforeEach(() => {
    mocked.tagCreate.mockReset();
    mocked.tagDestroy.mockReset();
    mocked.tagFindAll.mockReset();
    mocked.tagCreate.mockResolvedValue({});
    mocked.tagDestroy.mockResolvedValue(0);
    mocked.tagFindAll.mockResolvedValue([]);
  });

  it('normalizes names and de-duplicates tag sources by priority', async () => {
    const { buildArticleTags } = await import('../../services/crawl/persistence/tags.js');

    expect(buildArticleTags({
      inferredTags: ['Hardware', 'geekcomputerspcs', ''],
      providerTags: ['hardware', 'Provider topic', 'Nieuws / computers / browsers'],
      feedTags: ['hardware', 'Security'],
      ruleTags: ['HARDWARE', 'Must Read']
    })).toEqual([
      { name: 'hardware', tagType: 'rule' },
      { name: 'geekcomputerspcs', tagType: 'inferred' },
      { name: 'provider topic', tagType: 'provider' },
      { name: 'nieuws', tagType: 'provider' },
      { name: 'computers', tagType: 'provider' },
      { name: 'browsers', tagType: 'provider' },
      { name: 'security', tagType: 'feed' },
      { name: 'must read', tagType: 'rule' }
    ]);
  });

  it('replaces crawl-derived tags while preserving manual tags and untouched provenance', async () => {
    const transaction = { id: 'tag-update-transaction' };
    mocked.tagFindAll.mockResolvedValue([
      { name: 'old-inferred', tagType: 'inferred' },
      { name: 'provider-existing', tagType: 'provider' },
      { name: 'old-rule', tagType: 'rule' },
      { name: 'feed-existing', tagType: 'feed' },
      { name: 'manual-tag', tagType: null }
    ]);
    const { replaceArticleDerivedTags } = await import('../../services/crawl/persistence/tags.js');

    await replaceArticleDerivedTags({
      articleId: 123,
      userId: 42,
      inferredTags: ['new-inferred', 'manual-tag'],
      providerTags: ['new-provider'],
      ruleTags: ['new-rule'],
      transaction
    });

    expect(mocked.tagFindAll).toHaveBeenCalledWith({
      where: { articleId: 123, userId: 42 },
      transaction
    });
    expect(mocked.tagDestroy).toHaveBeenCalledWith({
      where: {
        articleId: 123,
        userId: 42,
        tagType: expect.any(Object)
      },
      transaction
    });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'new-inferred',
      tagType: 'inferred'
    }, { transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'new-provider',
      tagType: 'provider'
    }, { transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'feed-existing',
      tagType: 'feed'
    }, { transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'new-rule',
      tagType: 'rule'
    }, { transaction });
    expect(mocked.tagCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'manual-tag' }),
      expect.any(Object)
    );
    expect(mocked.tagCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'old-inferred' }),
      expect.any(Object)
    );
  });
});
