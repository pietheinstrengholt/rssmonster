import { describe, expect, it } from 'vitest';

import { buildCanonicalEventProjection } from '../../services/events/eventProjection.js';

// This function builds an article-shaped projection input.
function article(id, articleVector, overrides = {}) {
  return {
    id,
    feedId: id,
    publishedAt: new Date(`2026-07-22T0${id}:00:00.000Z`),
    createdAt: new Date(`2026-07-22T0${id}:05:00.000Z`),
    articleVector,
    ...overrides
  };
}

describe('buildCanonicalEventProjection', () => {
  it('produces the same event projection regardless of member order', () => {
    const articles = [
      article(1, [1, 0, 0]),
      article(2, [0.5, 0.5, 0]),
      article(3, [0, 1, 0])
    ];

    const forward = buildCanonicalEventProjection(articles);
    const reversed = buildCanonicalEventProjection(articles.slice().reverse());

    expect(reversed).toEqual(forward);
    expect(forward.eventVector).toEqual([0.5, 0.5, 0]);
    expect(forward.articleCount).toBe(3);
    expect(forward.sourceCount).toBe(3);
  });

  it('uses the existing event vector only when no member vector is persisted', () => {
    const projection = buildCanonicalEventProjection(
      [article(1, null)],
      [0.25, 0.75, 0]
    );

    expect(projection.eventVector).toEqual([0.25, 0.75, 0]);
  });
});
