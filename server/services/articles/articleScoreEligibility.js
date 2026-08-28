import { Op } from 'sequelize';

// Optional inference must not make otherwise-visible articles fail score gates.
export const SCORE_THRESHOLD_EXEMPT_ANALYSIS_STATUSES = Object.freeze([
  'pending',
  'processing',
  'failed'
]);

// Builds one reusable predicate for every configured article score threshold.
export const buildArticleScoreEligibility = ({
  minAdvertisementScore = 0,
  minSentimentScore = 0,
  minQualityScore = 0
} = {}) => ({
  [Op.or]: [
    {
      aiAnalysisStatus: {
        [Op.in]: [...SCORE_THRESHOLD_EXEMPT_ANALYSIS_STATUSES]
      }
    },
    {
      [Op.and]: [
        { advertisementScore: { [Op.gte]: minAdvertisementScore ?? 0 } },
        { sentimentScore: { [Op.gte]: minSentimentScore ?? 0 } },
        { qualityScore: { [Op.gte]: minQualityScore ?? 0 } }
      ]
    }
  ]
});

// Appends score eligibility without competing with unrelated Op.or query clauses.
export const applyArticleScoreEligibility = (where, thresholds) => {
  where[Op.and] ??= [];
  where[Op.and].push(buildArticleScoreEligibility(thresholds));
  return where;
};
