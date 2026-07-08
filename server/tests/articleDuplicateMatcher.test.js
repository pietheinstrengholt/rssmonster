import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  findByUserContentStrippedHash: vi.fn(),
  findByUserContentHash: vi.fn(),
  findByFeedNormalizedUrlHash: vi.fn(),
  findByFeedUrlHash: vi.fn(),
  findFeedTitleCandidates: vi.fn()
}));

vi.mock('../services/crawl/findExistingArticle.js', () => ({
  findByUserContentStrippedHash: mocked.findByUserContentStrippedHash,
  findByUserContentHash: mocked.findByUserContentHash,
  findByFeedNormalizedUrlHash: mocked.findByFeedNormalizedUrlHash,
  findByFeedUrlHash: mocked.findByFeedUrlHash,
  findFeedTitleCandidates: mocked.findFeedTitleCandidates
}));

describe('article duplicate matcher', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => mock.mockReset());
    mocked.findByUserContentStrippedHash.mockResolvedValue(null);
    mocked.findByUserContentHash.mockResolvedValue(null);
    mocked.findByFeedNormalizedUrlHash.mockResolvedValue(null);
    mocked.findByFeedUrlHash.mockResolvedValue(null);
    mocked.findFeedTitleCandidates.mockResolvedValue([]);
  });

  it('checks cache in content, normalized URL, raw URL priority order', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../services/crawl/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A long enough article title',
      link: 'https://example.com/article?utm_source=rss',
      normalizedUrl: 'https://example.com/article',
      contentHash: 'content-hash',
      contentStrippedHash: 'stripped-hash',
      published: '2026-07-01T00:00:00.000Z'
    });
    const cache = {
      findByUserContentStrippedHash: vi.fn(() => ({ id: 1 })),
      findByUserContentHash: vi.fn(() => ({ id: 2 })),
      findByFeedNormalizedUrlHash: vi.fn(() => ({ id: 3 })),
      findByFeedUrlHash: vi.fn(() => ({ id: 4 }))
    };

    await expect(matchArticleDuplicate(identity, cache)).resolves.toEqual({
      matchedArticleId: 1,
      reason: 'contentStrippedHash',
      scope: 'user',
      source: 'cache'
    });
    expect(cache.findByUserContentHash).not.toHaveBeenCalled();
    expect(mocked.findByUserContentStrippedHash).not.toHaveBeenCalled();
  });

  it('falls back to database lookups when cache misses', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../services/crawl/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A long enough article title',
      link: 'https://example.com/article',
      contentHash: 'content-hash',
      contentStrippedHash: 'stripped-hash',
      published: '2026-07-01T00:00:00.000Z'
    });
    mocked.findByUserContentHash.mockResolvedValue({ id: 9 });

    await expect(matchArticleDuplicate(identity, null)).resolves.toEqual({
      matchedArticleId: 9,
      reason: 'contentHash',
      scope: 'user',
      source: 'database'
    });
    expect(mocked.findByUserContentStrippedHash).toHaveBeenCalledWith(identity);
    expect(mocked.findByUserContentHash).toHaveBeenCalledWith(identity);
    expect(mocked.findByFeedNormalizedUrlHash).not.toHaveBeenCalled();
  });

  it('does not use title fallback for normal strong URLs', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../services/crawl/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A long enough article title',
      link: 'https://example.com/article',
      published: '2026-07-01T00:00:00.000Z'
    });
    const cache = {
      findFeedTitleCandidates: vi.fn(() => [
        { id: 11, published: '2026-07-01T00:00:00.000Z' }
      ])
    };

    await expect(matchArticleDuplicate(identity, cache)).resolves.toBeNull();
    expect(cache.findFeedTitleCandidates).not.toHaveBeenCalled();
    expect(mocked.findFeedTitleCandidates).not.toHaveBeenCalled();
  });

  it('uses guarded title fallback only for weak URLs near the publish date', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../services/crawl/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A LONG enough article title',
      link: 'not a url',
      published: '2026-07-08T00:00:00.000Z'
    });
    const cache = {
      findFeedTitleCandidates: vi.fn(title => {
        expect(title).toBe('A LONG enough article title');
        return [
        { id: 10, published: '2026-06-20T00:00:00.000Z' },
        { id: 11, published: '2026-07-02T00:00:00.000Z' }
        ];
      })
    };

    await expect(matchArticleDuplicate(identity, cache)).resolves.toEqual({
      matchedArticleId: 11,
      reason: 'title',
      scope: 'feed',
      source: 'cache'
    });
  });

  it('rejects short weak-URL titles', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../services/crawl/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'Untitled',
      link: 'not a url',
      published: '2026-07-08T00:00:00.000Z'
    });
    const cache = {
      findFeedTitleCandidates: vi.fn(() => [
        { id: 11, published: '2026-07-08T00:00:00.000Z' }
      ])
    };

    await expect(matchArticleDuplicate(identity, cache)).resolves.toBeNull();
    expect(cache.findFeedTitleCandidates).not.toHaveBeenCalled();
  });
});
