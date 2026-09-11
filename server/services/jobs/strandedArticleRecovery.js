import { isInferenceConfigured } from '../inference/configuration.js';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { shouldSkipArticleClassification } from '../../config/intelligentFeatures.js';
import { enqueueArticleEnrichmentJob } from '../crawl/enrichment/articleEnrichmentJobs.js';

const { Article, Feed, ProcessingJob, sequelize } = db;
const unfinishedStatuses = ['pending', 'processing'];
const activeJobWhere = userId => ({
  userId,
  type: 'article_enrichment',
  status: { [Op.in]: ['pending', 'running'] }
});

const strandedScope = userId => ({
  where: {
    userId,
    filteredInd: false,
    aiAnalysisStatus: { [Op.in]: unfinishedStatuses },
    '$processingJobs.id$': null
  },
  include: [
    { model: Feed, attributes: [], required: true, where: { userId, applyAiAnalysis: true } },
    {
      model: ProcessingJob,
      as: 'processingJobs',
      attributes: [],
      required: false,
      where: activeJobWhere(userId)
    }
  ]
});

// Terminal or cleared job history must not leave unfinished articles without runnable work.
export const countStrandedArticleAnalyses = async ({ userId }) => {
  if (shouldSkipArticleClassification() || !await isInferenceConfigured()) return 0;
  return Article.count(strandedScope(userId));
};

export const recoverStrandedArticleAnalyses = async ({ userId, limit }) => {
  if (shouldSkipArticleClassification() || !await isInferenceConfigured() || limit <= 0) return 0;
  const candidates = await Article.findAll({
    ...strandedScope(userId),
    attributes: ['id'],
    order: [['id', 'ASC']],
    limit,
    subQuery: false
  });
  let recoveredCount = 0;
  for (const candidate of candidates) {
    const recovered = await sequelize.transaction(async transaction => {
      // Serialize recovery with article revisions and concurrent recovery requests.
      const article = await Article.findOne({
        where: { id: candidate.id, userId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!article || article.filteredInd || !unfinishedStatuses.includes(article.aiAnalysisStatus)) return false;
      const feed = await Feed.findOne({
        where: { id: article.feedId, userId, applyAiAnalysis: true },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!feed) return false;
      const activeJob = await ProcessingJob.findOne({
        where: { ...activeJobWhere(userId), articleId: article.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (activeJob) return false;
      await article.update({ aiAnalysisStatus: 'pending', aiAnalysisCompletedAt: null }, { transaction });
      const result = await enqueueArticleEnrichmentJob({
        article,
        userId,
        actionResult: {
          advertisementScore: article.advertisementScoreActionOverrideInd ? article.advertisementScore : null,
          qualityScore: article.qualityScoreActionOverrideInd ? article.qualityScore : null
        },
        transaction
      });
      return result.created || result.reactivated;
    });
    if (recovered) recoveredCount++;
  }
  return recoveredCount;
};
