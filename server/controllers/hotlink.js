import db from '../models/index.js';
import { Op } from 'sequelize';
const { Hotlink, sequelize } = db;

export const clearCache = async () => {
  try {
    // cleanup old records more than 14 days old
    await Hotlink.destroy({
      where: {
        createdAt: {
          [Op.lte]: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        }
      }
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
export const replaceMany = async (hotlinkSets, feedId, userId) => {
  const replacements = hotlinkSets
    .filter(hotlinkSet => hotlinkSet.sourceArticleId)
    .map(hotlinkSet => ({
      sourceArticleId: hotlinkSet.sourceArticleId,
      urls: [...new Set(hotlinkSet.urls.filter(Boolean))]
    }));

  if (!replacements.length) return;

  await sequelize.transaction(async transaction => {
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
  });
};

// This function stores a batch of outbound links in one database query.
export const setMany = async (urls, feedId, userId, sourceArticleId = null) => {
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
  ], feedId, userId);
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
