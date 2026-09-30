import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { applyArticleScoreEligibility } from './articleScoreEligibility.js';

const { Setting } = db;

// Builds the shared user-owned article scope used by overview and notification counts.
export const buildVisibleArticleWhere = async userId => {
  const settings = await Setting.findOne({
    where: { userId },
    attributes: [
      'minAdvertisementScore',
      'minSentimentScore',
      'minOverallQualityScore',
      'minQualityScore'
    ],
    raw: true
  });

  return applyArticleScoreEligibility({
    userId,
    ...canonicalArticleWhere(),
    filteredInd: false
  }, {
    minAdvertisementScore: settings?.minAdvertisementScore,
    minSentimentScore: settings?.minSentimentScore,
    minOverallQualityScore: settings?.minOverallQualityScore,
    minQualityScore: settings?.minQualityScore
  });
};
