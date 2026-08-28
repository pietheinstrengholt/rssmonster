import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';

const { Article } = db;

describe('Article score action provenance fields', () => {
  it.each([
    'advertisementScoreActionOverrideInd',
    'qualityScoreActionOverrideInd'
  ])('declares %s as false-by-default persisted state', field => {
    expect(Article.rawAttributes[field]).toMatchObject({
      allowNull: false,
      defaultValue: false
    });
  });

  it('keeps internal provenance out of serialized articles', () => {
    const article = Article.build({
      advertisementScoreActionOverrideInd: true,
      qualityScoreActionOverrideInd: true
    });

    expect(article.toJSON()).not.toHaveProperty('advertisementScoreActionOverrideInd');
    expect(article.toJSON()).not.toHaveProperty('qualityScoreActionOverrideInd');
  });
});
