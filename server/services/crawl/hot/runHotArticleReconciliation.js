import { recordProcessingFailure } from '../../observability/processingFailures.js';
import { sanitizeFeedLogValue } from '../../feeds/feedLogging.js';
import reconcileHotArticles, { normalizeUserIds } from './reconcileHotArticles.js';

// Reconciles users independently so one failure does not hide successful user work.
const runHotArticleReconciliation = async ({
  processedUserIds,
  cutoffDate,
  crawlRunId = null,
  executionId = null,
  transaction = null,
  continueOnError = true,
  source = 'crawl'
}) => {
  const userIds = normalizeUserIds(processedUserIds);
  const results = [];

  for (const userId of userIds) {
    try {
      const result = await reconcileHotArticles({
        processedUserIds: [userId],
        cutoffDate,
        transaction
      });
      console.log(
        `[HOTLINK] reconciliation source=${source} user=${userId} ` +
        `inspected=${result.scannedCount} changed=${result.updatedCount} ` +
        `madeHot=${result.madeHotCount} hot=${result.hotCount} ` +
        `cleared=${result.clearedCount}`
      );
      results.push({ userId, status: 'completed', ...result });
    } catch (error) {
      await recordProcessingFailure({
        crawlRunId,
        executionId,
        userId,
        stage: 'hot_reconciliation',
        severity: 'ERROR',
        error,
        subjectType: 'user',
        subjectId: userId,
        retryable: true,
        context: {
          source,
          cutoffDate: Number.isNaN(new Date(cutoffDate).getTime())
            ? null
            : new Date(cutoffDate).toISOString()
        }
      });
      console.error(
        `[HOTLINK] reconciliation failed source=${source} user=${userId}:`,
        sanitizeFeedLogValue(error)
      );
      results.push({ userId, status: 'failed' });
      if (!continueOnError) throw error;
    }
  }

  const completedResults = results.filter(result => result.status === 'completed');
  return {
    userIds,
    users: userIds.length,
    completed: completedResults.length,
    failed: results.length - completedResults.length,
    scannedCount: completedResults.reduce((count, result) =>
      count + Number(result.scannedCount || 0), 0),
    updatedCount: completedResults.reduce((count, result) =>
      count + Number(result.updatedCount || 0), 0),
    hotCount: completedResults.reduce((count, result) =>
      count + Number(result.hotCount || 0), 0),
    madeHotCount: completedResults.reduce((count, result) =>
      count + Number(result.madeHotCount || 0), 0),
    clearedCount: completedResults.reduce((count, result) =>
      count + Number(result.clearedCount || 0), 0),
    results
  };
};

export default runHotArticleReconciliation;
