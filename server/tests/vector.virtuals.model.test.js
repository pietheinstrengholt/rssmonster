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
      topicVector: [index, index * 2]
    }));

    const unstarredArticles = [
      {
        starInd: 0,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 1, 0)),
        topicVector: [999, 999]
      }
    ];

    user.setDataValue('articles', [...starredArticles, ...unstarredArticles]);

    expect(user.interestVector).toEqual([11.5, 23]);
  });

  it('computes Article similarity using cosine similarity against user interestVector', () => {
    const user = User.build({
      username: 'similarity-user',
      password: 'secret',
      hash: 'hash'
    });

    user.setDataValue('articles', [
      {
        starInd: 1,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0)),
        topicVector: [1, 0]
      },
      {
        starInd: 1,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 1)),
        topicVector: [1, 0]
      }
    ]);

    const matchingArticle = Article.build({
      userId: 1,
      feedId: 1,
      url: 'https://example.com/match',
      title: 'Match',
      topicVector: [1, 0]
    });
    matchingArticle.setDataValue('user', user);

    const orthogonalArticle = Article.build({
      userId: 1,
      feedId: 1,
      url: 'https://example.com/orthogonal',
      title: 'Orthogonal',
      topicVector: [0, 1]
    });
    orthogonalArticle.setDataValue('user', user);

    expect(matchingArticle.similarity).toBe(1);
    expect(orthogonalArticle.similarity).toBe(0);
  });

  it('returns 0 similarity when user vector is unavailable', () => {
    const article = Article.build({
      userId: 1,
      feedId: 1,
      url: 'https://example.com/no-user',
      title: 'No user',
      topicVector: [1, 0]
    });

    expect(article.similarity).toBe(0);
  });
});
