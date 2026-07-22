import { describe, expect, it } from 'vitest';

import ArticleEventCandidateCache from '../../services/events/ArticleEventCandidateCache.js';

const TARGET_DATE = new Date('2026-07-22T12:09:19.000Z');

// This function builds one vectorized candidate record for cache selection tests.
function candidateRecord(id, overrides = {}) {
  return {
    id,
    userId: 1,
    feedId: 1,
    eventId: null,
    title: `Candidate ${id}`,
    description: '',
    publishedAt: TARGET_DATE,
    createdAt: TARGET_DATE,
    articleVector: [1, 0, 0],
    ...overrides
  };
}

describe('ArticleEventCandidateCache', () => {
  it('keeps an equally close current-run article inside the 300-candidate cap', () => {
    const cache = new ArticleEventCandidateCache({ userId: 1 });

    for (let id = 1; id <= 350; id++) {
      cache.insert(candidateRecord(id));
    }

    cache.update(candidateRecord(351));

    const candidates = cache.findNearby(candidateRecord(352));

    expect(candidates).toHaveLength(300);
    expect(candidates.map(candidate => candidate.id)).toContain(351);
  });

  it('selects the temporally closest historical candidates before applying the cap', () => {
    const cache = new ArticleEventCandidateCache({ userId: 1 });
    const hourMs = 60 * 60 * 1000;

    for (let id = 1; id <= 300; id++) {
      cache.insert(candidateRecord(id, {
        publishedAt: new Date(TARGET_DATE.getTime() - 20 * hourMs)
      }));
    }

    cache.insert(candidateRecord(301, {
      publishedAt: new Date(TARGET_DATE.getTime() - hourMs)
    }));

    const candidates = cache.findNearby(candidateRecord(302));

    expect(candidates).toHaveLength(300);
    expect(candidates.map(candidate => candidate.id)).toContain(301);
  });
});
