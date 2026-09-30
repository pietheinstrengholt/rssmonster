import { Op, where } from 'sequelize';
import { articleQualityPercentExpression } from './articleQuality.js';

// Optional inference must not make otherwise-visible articles fail score gates.
export const SCORE_THRESHOLD_EXEMPT_ANALYSIS_STATUSES = Object.freeze([
  'pending',
  'processing',
  'failed'
]);

const unresolvedAnalysis = () => ({
  aiAnalysisStatus: {
    [Op.in]: [...SCORE_THRESHOLD_EXEMPT_ANALYSIS_STATUSES]
  }
});

// Applies one score threshold while exempting only unresolved inference-owned values.
const scoreEligibility = ({ field, minimum, actionOverrideField = null }) => ({
  [Op.or]: [
    { [field]: { [Op.gte]: minimum ?? 0 } },
    {
      [Op.and]: [
        unresolvedAnalysis(),
        ...(actionOverrideField ? [{ [actionOverrideField]: false }] : [])
      ]
    }
  ]
});

// Builds one reusable predicate for every configured article score threshold.
export const buildArticleScoreEligibility = ({
  minAdvertisementScore = 0,
  minSentimentScore = 0,
  minQualityScore = 0,
  minOverallQualityScore = 0
} = {}) => ({
  [Op.and]: [
    ...(Number(minOverallQualityScore) > 0 ? [{
      [Op.or]: [
        where(articleQualityPercentExpression(), { [Op.gte]: Number(minOverallQualityScore) }),
        { [Op.and]: [unresolvedAnalysis(), { qualityScoreActionOverrideInd: false, advertisementScoreActionOverrideInd: false }] }
      ]
    }] : []),
    scoreEligibility({
      field: 'advertisementScore',
      minimum: minAdvertisementScore,
      actionOverrideField: 'advertisementScoreActionOverrideInd'
    }),
    scoreEligibility({ field: 'sentimentScore', minimum: minSentimentScore }),
    scoreEligibility({
      field: 'qualityScore',
      minimum: minQualityScore,
      actionOverrideField: 'qualityScoreActionOverrideInd'
    })
  ]
});

// Appends score eligibility without competing with unrelated Op.or query clauses.
export const applyArticleScoreEligibility = (where, thresholds) => {
  where[Op.and] ??= [];
  where[Op.and].push(buildArticleScoreEligibility(thresholds));
  return where;
};
