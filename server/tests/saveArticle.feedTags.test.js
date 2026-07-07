import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleCreate: vi.fn(),
  tagCreate: vi.fn()
}));

vi.mock('../models/index.js', () => ({
  default: {
    Article: {
      create: mocked.articleCreate
    },
    Tag: {
      create: mocked.tagCreate
    }
  }
}));

describe('saveArticle feed tags', () => {
  beforeEach(() => {
    mocked.articleCreate.mockReset();
    mocked.tagCreate.mockReset();
    mocked.articleCreate.mockResolvedValue({ id: 123 });
    mocked.tagCreate.mockResolvedValue({});
  });

  it('adds feed tags as extra article-level tags', async () => {
    const { default: saveArticle } = await import('../services/crawl/saveArticle.js');

    await saveArticle(
      {
        id: 7,
        userId: 42,
        feedTags: ['ai', 'Security', 'ai', 'must-read', '']
      },
      {
        link: 'https://example.com/article',
        title: 'Article title',
        description: 'Description',
        contentOriginal: '<p>Body</p>',
        contentStripped: 'Body',
        contentHash: 'hash',
        mediaFound: false,
        language: 'en',
        published: new Date('2026-07-01T00:00:00Z')
      },
      {
        summary: 'Summary',
        contentSummaryBullets: [],
        tags: ['Generated', 'Hardware'],
        advertisementScore: 70,
        sentimentScore: 70,
        qualityScore: 70
      },
      {
        status: 'unread',
        favoriteInd: false,
        clickedAmount: 0,
        hotInd: false,
        tags: ['rule-tag', 'hardware']
      }
    );

    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'generated',
      tagType: 'generated'
    });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'ai',
      tagType: 'feed'
    });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'security',
      tagType: 'feed'
    });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'must-read',
      tagType: 'feed'
    });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'hardware',
      tagType: 'rule'
    });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'rule-tag',
      tagType: 'rule'
    });
    expect(mocked.tagCreate).toHaveBeenCalledTimes(6);
  });
});
