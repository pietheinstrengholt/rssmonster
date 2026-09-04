import db from '../models/index.js';
import { Op } from 'sequelize';
import {
  assertExecutionLeaseOwnership,
  throwIfExecutionExpired
} from '../services/feeds/executionDeadline.js';
import {
  hotArticleCutoffDate
} from '../services/crawl/hot/reconcileHotArticles.js';
import runHotArticleReconciliation from
  '../services/crawl/hot/runHotArticleReconciliation.js';
const { Hotlink, sequelize } = db;

export const clearCache = async () => {
  try {
    // cleanup old records more than 14 days old
    const cutoffDate = hotArticleCutoffDate();
    await sequelize.transaction(async transaction => {
      const expiredUserRows = await Hotlink.findAll({
        attributes: ['userId'],
        where: {
          createdAt: { [Op.lte]: cutoffDate }
        },
        group: ['userId'],
        transaction,
        raw: true
      });
      await Hotlink.destroy({
        where: {
          createdAt: { [Op.lte]: cutoffDate }
        },
        transaction
      });

      await runHotArticleReconciliation({
        processedUserIds: expiredUserRows.map(row => row.userId),
        cutoffDate,
        transaction,
        continueOnError: false,
        source: 'observation_cleanup'
      });
    });
  } catch (err) {
    // Some legacy databases may miss hotlinks.createdAt; skip cleanup instead of crashing.
    if (
      err?.name === 'SequelizeDatabaseError' &&
      String(err?.message || '').includes("Unknown column 'createdAt'")
    ) {
      console.warn('Skipping hotlink cleanup: hotlinks.createdAt column is missing.');
      return;
    }

    throw err;
  }
};

export const set = async (url, feedId, userId) => {
  await Hotlink.create({ url, feedId, userId });
};

// This function atomically replaces outbound links for multiple source articles.
export const replaceMany = async (
  hotlinkSets,
  feedId,
  userId,
  execution = {}
) => {
  throwIfExecutionExpired(execution);
  const replacements = hotlinkSets
    .filter(hotlinkSet => hotlinkSet.sourceArticleId)
    .map(hotlinkSet => ({
      sourceArticleId: hotlinkSet.sourceArticleId,
      urls: [...new Set(hotlinkSet.urls.filter(Boolean))]
    }));

  if (!replacements.length) return;

  await sequelize.transaction(async transaction => {
    throwIfExecutionExpired(execution);
    await assertExecutionLeaseOwnership(execution, { transaction });
    await Hotlink.destroy({
      where: {
        userId,
        feedId,
        sourceArticleId: {
          [Op.in]: replacements.map(replacement => replacement.sourceArticleId)
        }
      },
      transaction
    });
    throwIfExecutionExpired(execution);

    const rows = replacements.flatMap(replacement =>
      replacement.urls.map(url => ({
        url,
        feedId,
        userId,
        sourceArticleId: replacement.sourceArticleId
      }))
    );

    if (!rows.length) return;
    await Hotlink.bulkCreate(rows, { transaction });
    throwIfExecutionExpired(execution);
  });
};

// This function stores a batch of outbound links in one database query.
export const setMany = async (
  urls,
  feedId,
  userId,
  sourceArticleId = null,
  execution = {}
) => {
  throwIfExecutionExpired(execution);
  const uniqueUrls = [...new Set(urls.filter(Boolean))];

  if (!sourceArticleId) {
    if (!uniqueUrls.length) return;
    await Hotlink.bulkCreate(uniqueUrls.map(url => ({ url, feedId, userId })));
    return;
  }

  await replaceMany([
    {
      sourceArticleId,
      urls: uniqueUrls
    }
  ], feedId, userId, execution);
};

export const get = (url, feedId, userId) => Hotlink.findOne({ where: { url, feedId, userId } });

export const all = () => Hotlink.findAll();

export default {
  clearCache,
  set,
  setMany,
  replaceMany,
  get,
  all
};
