import { describe, it, expect } from 'vitest';
import db from '../models/index.js';

const { Article } = db;

describe('Vector virtual attributes', () => {
  it('returns cached similarityScore via Article similarity virtual', () => {
    const article = Article.build({
      userId: 1,
      feedId: 1,
      url: 'https://example.com/cached-similarity',
      title: 'Cached similarity',
      similarityScore: 0.82
    });

    expect(article.similarity).toBe(0.82);
  });

  it('returns 0 similarity when cached score is unavailable', () => {
    const article = Article.build({
      userId: 1,
      feedId: 1,
      url: 'https://example.com/no-user',
      title: 'No cached score'
    });

    expect(article.similarity).toBe(0);
  });
});
