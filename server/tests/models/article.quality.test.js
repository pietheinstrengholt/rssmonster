import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';

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
  it('keeps low-sample feed quality close to the article-only score', () => {
    const feed = Feed.build({
      feedTrust: 1,
      feedDuplicationRate: 0,
      feedAttentionSampleSize: 5
    });

    expect(buildNeutralArticle(feed).quality).toBeCloseTo(0.7, 3);
  });

  it('gently boosts quality for high-confidence trusted feeds', () => {
    const feed = Feed.build({
      feedTrust: 1,
      feedDuplicationRate: 0,
      feedAttentionSampleSize: 100
    });

    expect(buildNeutralArticle(feed).quality).toBeCloseTo(0.77, 3);
  });

  it('gently dampens quality for low-trust duplicate-heavy feeds', () => {
    const feed = Feed.build({
      feedTrust: 0,
      feedDuplicationRate: 1,
      feedAttentionSampleSize: 100
    });

    expect(buildNeutralArticle(feed).quality).toBeCloseTo(0.595, 3);
  });
});
