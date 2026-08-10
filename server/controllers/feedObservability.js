import db from '../models/index.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';
import { deriveFeedOverviewHealth } from '../services/feeds/feedOverviewHealth.js';

const { Article, Feed, FeedCrawlResult, Sequelize } = db;
const { Op } = Sequelize;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_CRAWL_LIMIT = 20;

// Rounds one percentage to a stable single decimal place.
const percentage = (count, total) => total > 0
  ? Math.round((Number(count) * 1000) / total) / 10
  : null;

// Reads the implemented failure taxonomy directly from the registered model.
const failureCategories = () => (
  FeedCrawlResult.getAttributes?.().errorCategory.values || []
);

// Converts aggregate database values into the screen summary contract.
const buildSummary = row => {
  const totalCrawls = Number(row?.totalCrawls) || 0;
  const successful = Number(row?.successful) || 0;
  const recovered = Number(row?.recovered) || 0;
  const failed = Number(row?.failed) || 0;
  const hasAverageDuration = row?.averageDurationMs !== null &&
    row?.averageDurationMs !== undefined;
  const averageDuration = Number(row?.averageDurationMs);

  return {
    totalCrawls,
    successful,
    recovered,
    failed,
    successRatePct: percentage(successful + recovered, totalCrawls),
    recoveryRatePct: percentage(recovered, totalCrawls),
    averageDurationMs: hasAverageDuration && Number.isFinite(averageDuration)
      ? Math.round(averageDuration)
      : null
  };
};

// Initializes known failure categories and applies grouped crawl-result counts.
const buildFailureBreakdown = rows => {
  const breakdown = Object.fromEntries(
    failureCategories().map(category => [category, 0])
  );
  for (const row of rows) {
    if (row.errorCategory) breakdown[row.errorCategory] = Number(row.count) || 0;
  }
  return breakdown;
};

// Selects the fields exposed by recent crawl history without attempt diagnostics.
const recentCrawlAttributes = [
  'id', 'status', 'errorCategory', 'durationMs', 'itemsFetched', 'startedAt',
  'completedAt', 'requestedUrl', 'resolvedUrl', 'recoveryAttempted',
  'recoverySucceeded', 'attemptCount'
];

// Selects the complete bounded crawl-detail contract.
const crawlDetailAttributes = [
  'id', 'status', 'errorCategory', 'errorCode', 'httpStatus', 'errorMessage',
  'requestedUrl', 'resolvedUrl', 'recoveryAttempted', 'recoverySucceeded',
  'attemptCount', 'attemptSummary', 'itemsFetched', 'articlesNew',
  'articlesUpdated', 'articlesUnchanged', 'articlesDuplicate', 'durationMs',
  'startedAt', 'completedAt'
];

// Returns the screen-oriented feed observability snapshot for one owned feed.
export const getFeedObservability = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feed = await Feed.findOne({
      where: { id: req.params.feedId, userId }
    });
    if (!feed) return res.status(404).json({ message: 'Feed not found' });

    const feedData = feed.toJSON();
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
    const crawlWhere = {
      userId,
      feedId: feed.id,
      completedAt: { [Op.gte]: thirtyDaysAgo }
    };
    const [summaryRow, failureRows, crawlHealth, recentCrawls, articleStats] =
      await Promise.all([
        FeedCrawlResult.findOne({
          attributes: [
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalCrawls'],
            [Sequelize.literal("SUM(CASE WHEN `status` = 'SUCCESS' THEN 1 ELSE 0 END)"), 'successful'],
            [Sequelize.literal("SUM(CASE WHEN `status` = 'RECOVERED' THEN 1 ELSE 0 END)"), 'recovered'],
            [Sequelize.literal("SUM(CASE WHEN `status` = 'FAILED' THEN 1 ELSE 0 END)"), 'failed'],
            [Sequelize.literal('AVG(CASE WHEN `durationMs` >= 0 THEN `durationMs` ELSE NULL END)'), 'averageDurationMs']
          ],
          where: crawlWhere,
          raw: true
        }),
        FeedCrawlResult.findAll({
          attributes: [
            'errorCategory',
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
          ],
          where: { ...crawlWhere, errorCategory: { [Op.ne]: null } },
          group: ['errorCategory'],
          raw: true
        }),
        FeedCrawlResult.findAll({
          attributes: [
            [Sequelize.fn('DATE', Sequelize.col('completedAt')), 'date'],
            [Sequelize.literal("SUM(CASE WHEN `status` = 'SUCCESS' THEN 1 ELSE 0 END)"), 'success'],
            [Sequelize.literal("SUM(CASE WHEN `status` = 'RECOVERED' THEN 1 ELSE 0 END)"), 'recovered'],
            [Sequelize.literal("SUM(CASE WHEN `status` = 'FAILED' THEN 1 ELSE 0 END)"), 'failed']
          ],
          where: crawlWhere,
          group: [Sequelize.fn('DATE', Sequelize.col('completedAt'))],
          order: [[Sequelize.fn('DATE', Sequelize.col('completedAt')), 'ASC']],
          raw: true
        }),
        FeedCrawlResult.findAll({
          attributes: recentCrawlAttributes,
          where: { userId, feedId: feed.id },
          order: [['completedAt', 'DESC'], ['id', 'DESC']],
          limit: RECENT_CRAWL_LIMIT,
          raw: true
        }),
        Article.findOne({
          attributes: [
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'articleCount'],
            [Sequelize.literal("SUM(CASE WHEN `publishedAt` >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END)"), 'articleCount30Days'],
            [Sequelize.fn('MAX', Sequelize.col('publishedAt')), 'lastArticleAt']
          ],
          where: { userId, feedId: feed.id, ...canonicalArticleWhere() },
          raw: true
        })
      ]);

    const summary = buildSummary(summaryRow);
    const articleCount = Number(articleStats?.articleCount) || 0;
    const articleCount30Days = Number(articleStats?.articleCount30Days) || 0;
    const reliabilityPct = summary.successRatePct;

    return res.status(200).json({
      feed: {
        id: feedData.id,
        feedName: feedData.feedName,
        url: feedData.url,
        feedType: feedData.feedType,
        status: feedData.status,
        health: deriveFeedOverviewHealth(
          feedData,
          reliabilityPct,
          summary.totalCrawls
        ),
        lastCrawlAt: feedData.lastCrawlAt ?? null,
        lastCrawlStatus: feedData.lastCrawlStatus ?? null,
        lastCrawlErrorCategory: feedData.lastCrawlErrorCategory ?? null,
        lastSuccessfulCrawlAt: feedData.lastSuccessfulCrawlAt ?? null,
        consecutiveFailures: Number(feedData.consecutiveFailures) || 0
      },
      summary,
      // Recovered results retain the initial recovery-triggering category here.
      failures: buildFailureBreakdown(failureRows),
      statistics: {
        articleCount,
        articlesPerDay: Math.round((articleCount30Days / 30) * 10) / 10,
        duplicateRatePct: Math.round((Number(feedData.feedDuplicationRate) || 0) * 1000) / 10,
        trustScore: Number(feedData.feedTrust) || 0,
        lastArticleAt: articleStats?.lastArticleAt ?? null
      },
      // Days without completed results are intentionally absent.
      crawlHealth: crawlHealth.map(row => ({
        date: row.date,
        success: Number(row.success) || 0,
        recovered: Number(row.recovered) || 0,
        failed: Number(row.failed) || 0
      })),
      recentCrawls
    });
  } catch (err) {
    console.error('Error in getFeedObservability:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Returns one expanded crawl result only when both feed and result are user-owned.
export const getFeedCrawlDetail = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feed = await Feed.findOne({
      attributes: ['id'],
      where: { id: req.params.feedId, userId },
      raw: true
    });
    if (!feed) return res.status(404).json({ message: 'Feed not found' });

    const crawl = await FeedCrawlResult.findOne({
      attributes: crawlDetailAttributes,
      where: {
        id: req.params.crawlResultId,
        feedId: feed.id,
        userId
      },
      raw: true
    });
    if (!crawl) return res.status(404).json({ message: 'Crawl result not found' });

    return res.status(200).json({ crawl });
  } catch (err) {
    console.error('Error in getFeedCrawlDetail:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default { getFeedCrawlDetail, getFeedObservability };
