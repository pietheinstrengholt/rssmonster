import { describe, expect, it } from 'vitest';
import { resolvePredictedAffinity } from '../../services/recommendations/predictedAffinityResolver.js';

describe('resolvePredictedAffinity', () => {
  it('returns measured source for already touched articles', () => {
    const result = resolvePredictedAffinity({
      article: { attentionBucket: 2, status: 'read' },
      feed: {
        feedAttentionAvg: 0.5,
        feedAttentionSampleSize: 20
      }
    });

    expect(result).toEqual({
      predictedAffinity: null,
      confidence: 1,
      source: 'measured'
    });
  });

  it('keeps low-sample feeds cold when click and attention signals are absent', () => {
    const result = resolvePredictedAffinity({
      article: { attentionBucket: 0, status: 'unread' },
      feed: {
        feedAttentionAvg: 0,
        feedDeepReadRatio: 0,
        feedSkimRatio: 0,
        feedClickAvg: 0,
        feedClickRatio: 0,
        feedAttentionSampleSize: 2
      }
    });

    expect(result.predictedAffinity).toBe('cold');
    expect(result.source).toBe('feed');
  });

  it('uses feed click behavior to predict engagement for new unread articles', () => {
    const result = resolvePredictedAffinity({
      article: { attentionBucket: 0, status: 'unread' },
      feed: {
        feedAttentionAvg: 0.05,
        feedDeepReadRatio: 0,
        feedSkimRatio: 0.1,
        feedIgnoreRatio: 0.2,
        feedClickAvg: 0.6,
        feedClickRatio: 0.3,
        feedAttentionSampleSize: 2
      }
    });

    expect(result.predictedAffinity).toBe('medium');
    expect(result.engagementScore).toBeGreaterThan(0);
  });

  it('combines deep-read and click signals into a deep prediction', () => {
    const result = resolvePredictedAffinity({
      article: { attentionBucket: 0, status: 'unread' },
      feed: {
        feedAttentionAvg: 0.38,
        feedDeepReadRatio: 0.13,
        feedSkimRatio: 0.2,
        feedIgnoreRatio: 0.1,
        feedClickAvg: 0.4,
        feedClickRatio: 0.2,
        feedAttentionSampleSize: 30
      }
    });

    expect(result.predictedAffinity).toBe('deep');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('uses a safe default when article or feed context is absent', () => {
    expect(resolvePredictedAffinity({ article: null, feed: null })).toEqual({
      predictedAffinity: 'medium',
      confidence: 0.25,
      source: 'default'
    });
  });

  it('distinguishes skim value from consistently ignored feeds', () => {
    const article = { attentionBucket: 0, status: 'unread' };
    const skim = resolvePredictedAffinity({
      article,
      feed: { feedSkimRatio: 0.7, feedAttentionSampleSize: 20 }
    });
    const ignored = resolvePredictedAffinity({
      article,
      feed: { feedIgnoreRatio: 0.9, feedAttentionSampleSize: 20 }
    });

    expect(skim.predictedAffinity).toBe('skim');
    expect(ignored.predictedAffinity).toBe('ignore');
  });
});
