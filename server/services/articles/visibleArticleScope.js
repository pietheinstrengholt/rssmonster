import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

const { Setting } = db;

// Builds the shared user-owned article scope used by overview and notification counts.
export const buildVisibleArticleWhere = async userId => {
  const settings = await Setting.findOne({
    where: { userId },
    attributes: [
      'minAdvertisementScore',
      'minSentimentScore',
      'minQualityScore'
    ],
    raw: true
  });

  return {
    userId,
    ...canonicalArticleWhere(),
    filteredInd: false,
    advertisementScore: { [Op.gte]: settings?.minAdvertisementScore ?? 0 },
    sentimentScore: { [Op.gte]: settings?.minSentimentScore ?? 0 },
    qualityScore: { [Op.gte]: settings?.minQualityScore ?? 0 }
  };
};
