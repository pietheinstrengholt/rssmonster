import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  findByUserContentTextHash: vi.fn(),
  findByUserContentSourceHash: vi.fn(),
  findByFeedNormalizedUrlHash: vi.fn(),
  findByFeedUrlHash: vi.fn(),
  findFeedTitleCandidates: vi.fn()
}));

vi.mock('../../services/crawl/identity/findExistingArticle.js', () => ({
  findByUserContentTextHash: mocked.findByUserContentTextHash,
  findByUserContentSourceHash: mocked.findByUserContentSourceHash,
  findByFeedNormalizedUrlHash: mocked.findByFeedNormalizedUrlHash,
  findByFeedUrlHash: mocked.findByFeedUrlHash,
  findFeedTitleCandidates: mocked.findFeedTitleCandidates
}));

describe('article duplicate matcher', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => mock.mockReset());
    mocked.findByUserContentTextHash.mockResolvedValue(null);
    mocked.findByUserContentSourceHash.mockResolvedValue(null);
    mocked.findByFeedNormalizedUrlHash.mockResolvedValue(null);
    mocked.findByFeedUrlHash.mockResolvedValue(null);
    mocked.findFeedTitleCandidates.mockResolvedValue([]);
  });

  it('checks cache in content, normalized URL, raw URL priority order', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../../services/crawl/identity/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A long enough article title',
      link: 'https://example.com/article?utm_source=rss',
      normalizedUrl: 'https://example.com/article',
      contentSourceHash: 'content-hash',
      contentTextHash: 'stripped-hash',
      publishedAt: '2026-07-01T00:00:00.000Z'
    });
    const cache = {
      findByUserContentTextHash: vi.fn(() => ({ id: 1 })),
      findByUserContentSourceHash: vi.fn(() => ({ id: 2 })),
      findByFeedNormalizedUrlHash: vi.fn(() => ({ id: 3 })),
      findByFeedUrlHash: vi.fn(() => ({ id: 4 }))
    };

    await expect(matchArticleDuplicate(identity, cache)).resolves.toEqual({
      matchedArticleId: 1,
      reason: 'contentTextHash',
      scope: 'user',
      source: 'cache'
    });
    expect(cache.findByUserContentSourceHash).not.toHaveBeenCalled();
    expect(mocked.findByUserContentTextHash).not.toHaveBeenCalled();
  });

  it('falls back to database lookups when cache misses', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../../services/crawl/identity/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A long enough article title',
      link: 'https://example.com/article',
      contentSourceHash: 'content-hash',
      contentTextHash: 'stripped-hash',
      publishedAt: '2026-07-01T00:00:00.000Z'
    });
    mocked.findByUserContentSourceHash.mockResolvedValue({ id: 9 });

    await expect(matchArticleDuplicate(identity, null)).resolves.toEqual({
      matchedArticleId: 9,
      reason: 'contentSourceHash',
      scope: 'user',
      source: 'database'
    });
    expect(mocked.findByUserContentTextHash).toHaveBeenCalledWith(identity);
    expect(mocked.findByUserContentSourceHash).toHaveBeenCalledWith(identity);
    expect(mocked.findByFeedNormalizedUrlHash).not.toHaveBeenCalled();
  });

  it('skips visible-text lookup when content has no text identity', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../../services/crawl/identity/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'Media-only article with a strong URL',
      link: 'https://example.com/media-only',
      contentTextHash: null,
      publishedAt: '2026-07-01T00:00:00.000Z'
    });
    mocked.findByFeedNormalizedUrlHash.mockResolvedValue({ id: 12 });

    await expect(matchArticleDuplicate(identity, null)).resolves.toEqual({
      matchedArticleId: 12,
      reason: 'normalizedUrlHash',
      scope: 'feed',
      source: 'database'
    });
    expect(mocked.findByUserContentTextHash).not.toHaveBeenCalled();
    expect(mocked.findByFeedNormalizedUrlHash).toHaveBeenCalledWith(identity);
  });

  it('does not use title fallback for normal strong URLs', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../../services/crawl/identity/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A long enough article title',
      link: 'https://example.com/article',
      publishedAt: '2026-07-01T00:00:00.000Z'
    });
    const cache = {
      findFeedTitleCandidates: vi.fn(() => [
        { id: 11, publishedAt: '2026-07-01T00:00:00.000Z' }
      ])
    };

    await expect(matchArticleDuplicate(identity, cache)).resolves.toBeNull();
    expect(cache.findFeedTitleCandidates).not.toHaveBeenCalled();
    expect(mocked.findFeedTitleCandidates).not.toHaveBeenCalled();
  });

  it('uses guarded title fallback only for weak URLs near the publish date', async () => {
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../../services/crawl/identity/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'A LONG enough article title',
      link: 'not a url',
      publishedAt: '2026-07-08T00:00:00.000Z'
    });
    const cache = {
      findFeedTitleCandidates: vi.fn(title => {
        expect(title).toBe('A LONG enough article title');
        return [
        { id: 10, publishedAt: '2026-06-20T00:00:00.000Z' },
        { id: 11, publishedAt: '2026-07-02T00:00:00.000Z' }
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
    const { buildArticleIdentity, matchArticleDuplicate } = await import('../../services/crawl/identity/articleDuplicateMatcher.js');
    const identity = buildArticleIdentity({
      feed: { id: 7, userId: 42 },
      title: 'Untitled',
      link: 'not a url',
      publishedAt: '2026-07-08T00:00:00.000Z'
    });
    const cache = {
      findFeedTitleCandidates: vi.fn(() => [
        { id: 11, publishedAt: '2026-07-08T00:00:00.000Z' }
      ])
    };

    await expect(matchArticleDuplicate(identity, cache)).resolves.toBeNull();
    expect(cache.findFeedTitleCandidates).not.toHaveBeenCalled();
  });
});
