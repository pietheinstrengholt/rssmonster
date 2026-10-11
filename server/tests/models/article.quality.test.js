import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { computeArticleQuality, computeFeedTrust, computeQuality } from '../../services/articles/articleQuality.js';

const { Article, Feed } = db;

// This function builds an article with neutral component scores for virtual quality tests.
const buildNeutralArticle = feed => {
  const article = Article.build({
    advertisementScore: 70,
    sentimentScore: 70,
    qualityScore: 70
  });

  if (feed) {
    article.setDataValue('Feed', feed);
  }

  return article;
};

describe('Article quality virtual score', () => {
  it.each([
    ['quality', { qualityScore: 100, sentimentScore: 0, advertisementScore: 0 }, 0.5],
    ['sentiment', { qualityScore: 0, sentimentScore: 100, advertisementScore: 0 }, 0.25],
    ['advertisement', { qualityScore: 0, sentimentScore: 0, advertisementScore: 100 }, 0.25]
  ])('applies the configured %s weight', (_label, scores, expected) => {
    expect(Article.build(scores).quality).toBe(expected);
  });

  it('uses the neutral fallback for null scores', () => {
    const article = Article.build({
      qualityScore: null,
      sentimentScore: null,
      advertisementScore: null
    });

    expect(article.quality).toBe(0.7);
  });

  it('keeps feed evidence out of the article-only score', () => {
    const feed = Feed.build({
      feedTrust: 0,
      feedDuplicationRate: 1,
      feedAttentionSampleSize: 100
    });

    expect(buildNeutralArticle(feed).quality).toBe(0.7);
  });

  it('uses the same reusable calculation for models and plain objects', () => {
    const scores = {
      qualityScore: 90,
      sentimentScore: 60,
      advertisementScore: 40
    };

    expect(Article.build(scores).quality).toBe(computeArticleQuality(scores));
    expect(computeArticleQuality(scores)).toBe(0.7);
  });
});

describe('FeedTrust in quality ranking', () => {
  it.each([undefined, null, NaN, Infinity, -Infinity])('uses the neutral prior for unavailable trust (%s)', feedTrust => {
    const article = { Feed: { feedTrust } };
    expect(computeFeedTrust(article)).toBe(0.75);
    expect(computeQuality(article)).toBe(computeQuality({ Feed: { feedTrust: 0.75 } }));
  });

  it('uses the neutral prior when the Feed association is absent', () => {
    expect(computeFeedTrust({})).toBe(0.75);
    expect(computeFeedTrust(buildNeutralArticle())).toBe(0.75);
  });

  it.each([0, 0.4, 0.75, 1])('preserves estimated trust (%s)', feedTrust => {
    expect(computeFeedTrust({ Feed: { feedTrust } })).toBe(feedTrust);
    expect(computeFeedTrust(buildNeutralArticle(Feed.build({ feedTrust })))).toBe(feedTrust);
  });

  it('ranks unavailable trust above an estimated zero without changing Article quality', () => {
    const unavailable = buildNeutralArticle();
    const lowTrust = buildNeutralArticle(Feed.build({ feedTrust: 0 }));
    expect(computeQuality(unavailable)).toBeGreaterThan(computeQuality(lowTrust));
    expect(unavailable.quality).toBe(lowTrust.quality);
  });
});
