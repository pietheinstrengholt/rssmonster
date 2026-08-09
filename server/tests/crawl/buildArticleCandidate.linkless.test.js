import { describe, expect, it } from 'vitest';

import buildArticleCandidate from '../../services/crawl/orchestration/buildArticleCandidate.js';

// This function builds the minimum feed context required by candidate normalization.
const feed = () => ({
  id: 7,
  userId: 42,
  feedName: 'Linkless feed',
  feedTags: [],
  applyAiAnalysis: false
});

describe('buildArticleCandidate linkless entries', () => {
  it('accepts a content-bearing entry with a stable opaque GUID and no URL', async () => {
    const candidate = await buildArticleCandidate({
      feed: feed(),
      entry: {
        title: 'Linkless article',
        url: null,
        urlStatus: 'missing',
        externalId: 'opaque-guid-1',
        externalIdType: 'guid',
        content: '<p>Readable linkless article body.</p>',
        contentKind: 'html',
        categories: []
      },
      feedFormat: 'rss'
    });

    expect(candidate.articleData).toMatchObject({
      externalId: 'opaque-guid-1',
      externalIdType: 'guid',
      link: null,
      normalizedUrl: null,
      contentText: 'Readable linkless article body.'
    });
    expect(candidate.identityInput).toMatchObject({ link: null, normalizedUrl: null });
  });

  it('rejects an entry with neither a safe URL nor a stable format identity', async () => {
    await expect(buildArticleCandidate({
      feed: feed(),
      entry: {
        title: 'Unidentifiable entry',
        url: null,
        urlStatus: 'missing',
        content: '<p>Body without identity.</p>',
        contentKind: 'html'
      }
    })).resolves.toBeNull();
  });
});
