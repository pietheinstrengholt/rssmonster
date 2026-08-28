import { describe, expect, it } from 'vitest';
import { Op } from 'sequelize';
import {
  SCORE_THRESHOLD_EXEMPT_ANALYSIS_STATUSES,
  applyArticleScoreEligibility,
  buildArticleScoreEligibility
} from '../../services/articles/articleScoreEligibility.js';

describe('articleScoreEligibility', () => {
  it('exempts only unresolved and failed optional analysis from score thresholds', () => {
    expect(SCORE_THRESHOLD_EXEMPT_ANALYSIS_STATUSES).toEqual([
      'pending',
      'processing',
      'failed'
    ]);

    const predicate = buildArticleScoreEligibility({
      minAdvertisementScore: 80,
      minSentimentScore: 85,
      minQualityScore: 90
    });

    expect(predicate[Op.or][0]).toEqual({
      aiAnalysisStatus: { [Op.in]: ['pending', 'processing', 'failed'] }
    });
    expect(predicate[Op.or][1][Op.and]).toEqual([
      { advertisementScore: { [Op.gte]: 80 } },
      { sentimentScore: { [Op.gte]: 85 } },
      { qualityScore: { [Op.gte]: 90 } }
    ]);
  });

  it('preserves existing conjunctions when applying score eligibility', () => {
    const existingCondition = { status: 'unread' };
    const where = { userId: 7, [Op.and]: [existingCondition] };

    expect(applyArticleScoreEligibility(where, {})).toBe(where);
    expect(where[Op.and][0]).toBe(existingCondition);
    expect(where[Op.and][1][Op.or]).toBeDefined();
  });
});
