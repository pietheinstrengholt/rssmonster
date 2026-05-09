import { describe, it, expect } from 'vitest';
import db from '../models/index.js';

const { User, Article } = db;

describe('Vector virtual attributes', () => {
  it('computes User interestVector from 20 most recent starred articles', () => {
    const user = User.build({
      username: 'vector-user',
      password: 'secret',
      hash: 'hash'
    });

    const starredArticles = Array.from({ length: 22 }, (_, index) => ({
      starInd: 1,
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      eventVector: [index, index * 2]
    }));

    const unstarredArticles = [
      {
        starInd: 0,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 1, 0)),
        eventVector: [999, 999]
      }
    ];

    user.setDataValue('articles', [...starredArticles, ...unstarredArticles]);

    expect(user.interestVector).toEqual([11.5, 23]);
  });

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
