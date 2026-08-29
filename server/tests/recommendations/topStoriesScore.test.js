import { describe, expect, it } from 'vitest';
import {
  computeTopStories,
  computeTopStoriesBreakdown
} from '../../services/recommendations/topStoriesScore.js';

const articleWith = ({
  interestScore = 0,
  freshness = 0.5,
  quality = 0.5,
  event = null
} = {}) => ({
  interestScore,
  freshness,
  qualityScore: quality * 100,
  sentimentScore: quality * 100,
  advertisementScore: quality * 100,
  Feed: { feedTrust: quality },
  event
});

describe('computeTopStories', () => {
  it('raises ranking for greater event coverage', () => {
    const small = articleWith({ event: { articleCount: 2, sourceCount: 1 } });
    const large = articleWith({ event: { articleCount: 64, sourceCount: 1 } });

    expect(computeTopStories(large)).toBeGreaterThan(computeTopStories(small));
  });

  it('raises ranking for greater cross-source diversity', () => {
    const oneSource = articleWith({ event: { articleCount: 16, sourceCount: 1 } });
    const eightSources = articleWith({ event: { articleCount: 16, sourceCount: 8 } });

    expect(computeTopStories(eightSources)).toBeGreaterThan(computeTopStories(oneSource));
  });

  it('ranks a corroborated multi-source event strongly', () => {
    const breakdown = computeTopStoriesBreakdown(articleWith({
      event: { articleCount: 64, sourceCount: 8, sourceDiversityScore: Math.log(9) }
    }));

    expect(breakdown).toMatchObject({
      coverage: 1,
      crossSource: 1,
      corroboration: 1,
      eventImportance: 1
    });
    expect(breakdown.topStories).toBeCloseTo(0.8, 6);
  });

  it('does not use Interest Island affinity', () => {
    const disliked = computeTopStories(articleWith({ interestScore: -1 }));
    const preferred = computeTopStories(articleWith({ interestScore: 1 }));

    expect(preferred).toBe(disliked);
  });

  it('uses freshness as a meaningful signal', () => {
    const stale = computeTopStories(articleWith({ freshness: 0 }));
    const fresh = computeTopStories(articleWith({ freshness: 1 }));

    expect(fresh - stale).toBeCloseTo(0.25, 6);
  });

  it('uses Quality as a secondary preference', () => {
    const low = computeTopStories(articleWith({ quality: 0 }));
    const high = computeTopStories(articleWith({ quality: 1 }));

    expect(high - low).toBeCloseTo(0.15, 6);
  });

  it('keeps standalone articles eligible but below a strong current event', () => {
    const standalone = computeTopStories(articleWith({ freshness: 1, quality: 1 }));
    const eventBacked = computeTopStories(articleWith({
      freshness: 0.8,
      quality: 0.7,
      event: { articleCount: 64, sourceCount: 8, sourceDiversityScore: Math.log(9) }
    }));

    expect(standalone).toBeCloseTo(0.4, 6);
    expect(eventBacked).toBeGreaterThan(standalone);
  });

  it('keeps final scores within zero and one', () => {
    expect(computeTopStories(articleWith({ freshness: -2, quality: 0 }))).toBeGreaterThanOrEqual(0);
    expect(computeTopStories(articleWith({
      freshness: 5,
      quality: 1,
      event: { articleCount: 1000, sourceCount: 1000, sourceDiversityScore: 20 }
    }))).toBe(1);
  });
});
