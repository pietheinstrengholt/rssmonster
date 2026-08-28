import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { ARTICLE_AI_ANALYSIS_STATUSES } from '../../models/article.js';

const { Article } = db;

describe('Article AI analysis status model field', () => {
  it('declares the complete analysis lifecycle and historical-row default', () => {
    expect(Article.rawAttributes.aiAnalysisStatus).toMatchObject({
      allowNull: false,
      defaultValue: 'complete',
      values: ARTICLE_AI_ANALYSIS_STATUSES
    });
    expect(Article.rawAttributes.aiAnalysisCompletedAt).toMatchObject({
      allowNull: true,
      defaultValue: null
    });
  });

  it('declares an ownership-state index', () => {
    expect(Article.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'articles_userId_aiAnalysisStatus_idx',
        fields: ['userId', 'aiAnalysisStatus']
      })
    ]));
  });
});
