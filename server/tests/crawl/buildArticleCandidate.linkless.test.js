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

  it('resolves content and description URLs for a linkless stable-ID entry', async () => {
    const candidate = await buildArticleCandidate({
      feed: feed(),
      entry: {
        title: 'Linkless article with resources',
        url: null,
        urlStatus: 'missing',
        contentBaseUrl: 'https://feeds.example.com/articles/42/',
        externalId: 'opaque-guid-2',
        externalIdType: 'guid',
        content: '<p><a href="details">Details</a></p>',
        contentKind: 'html',
        description: '<p><img src="summary.jpg" alt="Summary"></p>',
        descriptionKind: 'html',
        categories: []
      }
    });

    expect(candidate.articleData).toMatchObject({
      link: null,
      contentBaseUrl: 'https://feeds.example.com/articles/42/'
    });
    expect(candidate.articleData.contentHtml).toContain(
      'href="https://feeds.example.com/articles/42/details"'
    );
    expect(candidate.articleData.descriptionHtml).toContain(
      'src="https://feeds.example.com/articles/42/summary.jpg"'
    );
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
