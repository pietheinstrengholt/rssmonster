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
    const { buildArticleTags } = await import('../../services/crawl/tags.js');

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

  it('replaces crawl-derived tags while preserving manual tags and untouched provenance', async () => {
    const transaction = { id: 'tag-update-transaction' };
    mocked.tagFindAll.mockResolvedValue([
      { name: 'old-generated', tagType: 'generated' },
      { name: 'old-rule', tagType: 'rule' },
      { name: 'feed-existing', tagType: 'feed' },
      { name: 'manual-tag', tagType: null }
    ]);
    const { replaceArticleDerivedTags } = await import('../../services/crawl/tags.js');

    await replaceArticleDerivedTags({
      articleId: 123,
      userId: 42,
      generatedTags: ['new-generated', 'manual-tag'],
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
      name: 'new-generated',
      tagType: 'generated'
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
      expect.objectContaining({ name: 'old-generated' }),
      expect.any(Object)
    );
  });
});
