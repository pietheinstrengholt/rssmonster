import { Op, fn, col, where } from 'sequelize';
import db from '../models/index.js';
import { getArchivingSettings, articleRetentionCutoff } from './archivingSettings.js';
import { prepareArticleEventRemoval } from './events/eventReconciliation.js';

const BATCH_SIZE = 500;

export { articleRetentionCutoff } from './archivingSettings.js';

export async function cleanupArticles(userId) {
  return db.sequelize.transaction(async transaction => {
    await db.User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    const settings = await getArchivingSettings(userId, transaction);
    const hasLimits = settings.maximumArticlesPerFeed !== null || settings.maximumArticlesTotal !== null;
    const cutoff = articleRetentionCutoff(settings.maximumAgeValue, settings.maximumAgeUnit);
    if (!hasLimits && !cutoff) return 0;

    const eligible = {
      userId,
      // Count limits take priority over age; age applies when no count cap is configured.
      ...(!hasLimits ? { [Op.and]: [where(fn('COALESCE', col('publishedAt'), col('createdAt')), { [Op.lt]: cutoff })] } : {}),
      ...(settings.neverDeleteUnread ? { status: 'read' } : {}),
      ...(settings.neverDeleteFavorites ? { [Op.or]: [{ favoriteInd: 0 }, { favoriteInd: null }] } : {}),
      ...(settings.neverDeleteClicked ? {
        clickedAmount: { [Op.or]: [0, null] }, lastClickedAt: null
      } : {})
    };
    let total = settings.maximumArticlesTotal === null ? 0 : await db.Article.count({ where: { userId }, transaction });
    let cursor = null;
    let deletedCount = 0;

    // Scan only eligible articles, with bounded metadata batches and stable oldest-first ordering.
    while (true) {
      const articles = await db.Article.findAll({
        where: { [Op.and]: [eligible, ...(cursor ? [{ [Op.or]: [
          { createdAt: { [Op.gt]: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { [Op.gt]: cursor.id } }
        ] }] : [])] },
        attributes: ['id', 'feedId', 'createdAt'],
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
        limit: BATCH_SIZE,
        transaction
      });
      if (!articles.length) break;
      cursor = articles.at(-1);

      // Counts include protected and newer articles: protections may leave a cap exceeded.
      const feedCounts = settings.maximumArticlesPerFeed === null ? [] : await db.Article.findAll({
        where: { userId, feedId: { [Op.in]: [...new Set(articles.map(article => article.feedId))] } },
        attributes: ['feedId', [fn('COUNT', col('id')), 'count']],
        group: ['feedId'],
        raw: true,
        transaction
      });
      const remainingByFeed = new Map(feedCounts.map(row => [row.feedId, Number(row.count)]));
      const ids = [];
      for (const article of articles) {
        const feedCount = remainingByFeed.get(article.feedId);
        if (!hasLimits || (settings.maximumArticlesTotal !== null && total > settings.maximumArticlesTotal) ||
          (settings.maximumArticlesPerFeed !== null && feedCount > settings.maximumArticlesPerFeed)) {
          ids.push(article.id);
          total -= 1;
          remainingByFeed.set(article.feedId, feedCount - 1);
        }
      }
      if (ids.length) {
        const { articleIds } = await prepareArticleEventRemoval(userId, {
          [Op.and]: [eligible, { id: { [Op.in]: ids } }]
        }, transaction);
        const removed = articleIds.length ? await db.Article.destroy({
          where: { userId, id: { [Op.in]: articleIds } }, transaction
        }) : 0;
        deletedCount += removed;
        total += ids.length - removed;
      }
      if (settings.maximumArticlesPerFeed === null && settings.maximumArticlesTotal !== null && total <= settings.maximumArticlesTotal) break;
    }
    return deletedCount;
  });
}
