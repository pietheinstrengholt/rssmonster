import db from '../models/index.js';
const { Feed, Category, Article, Setting } = db;

import Sequelize from "sequelize";
import { Op } from 'sequelize';

const buildCategoriesStructure = categoriesRaw => categoriesRaw.map(categoryRow => {
  const category = categoryRow.get({ plain: true });

  category.readCount = 0;
  category.unreadCount = 0;
  category.favoriteCount = 0;
  category.hotCount = 0;
  category.clickedCount = 0;

  category.feeds = (category.feeds || []).map(feed => ({
    ...feed,
    readCount: 0,
    unreadCount: 0,
    favoriteCount: 0,
    hotCount: 0,
    clickedCount: 0
  }));

  return category;
});

const buildCategoryFeedMaps = categories => {
  const categoryMap = {};
  const feedMap = {};

  categories.forEach(category => {
    categoryMap[category.id] = category;
    category.feeds.forEach(feed => {
      feedMap[feed.id] = { feed, category };
    });
  });

  return { categoryMap, feedMap };
};

const loadCategoriesStructure = userId => Category.findAll({
  where: { userId },
  include: [{
    model: Feed,
    required: false
  }],
  order: ['categoryOrder', 'name']
});

const applyClusterViewFilter = (baseWhere, clusterView) => {
  if (clusterView === 'eventCluster') {
    baseWhere[Op.or] = [
      {
        id: {
          [Op.in]: Sequelize.literal(
            `(SELECT representativeArticleId FROM events)`
          )
        }
      },
      {
        eventId: {
          [Op.is]: null
        }
      }
    ];
  }

  if (clusterView === 'topicGroup') {
    baseWhere[Op.or] = [
      {
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT e.representativeArticleId
            FROM events e
            INNER JOIN (
              SELECT userId, topicId, MAX(eventStrength) AS maxStrength
              FROM events
              WHERE topicId IS NOT NULL
              GROUP BY userId, topicId
            ) t
              ON e.userId = t.userId
              AND e.topicId = t.topicId
            AND e.eventStrength = t.maxStrength
            WHERE e.id = (
              SELECT MAX(e2.id)
              FROM events e2
              WHERE e2.userId = e.userId
                AND e2.topicId = e.topicId
                AND e2.eventStrength = e.eventStrength
            )
          )`)
        }
      },
      {
        eventId: {
          [Op.is]: null
        }
      }
    ];
  }
};

const buildOverviewWhere = async ({ userId, clusterView }) => {
  const settings = await Setting.findOne({
    where: { userId },
    attributes: [
      'minAdvertisementScore',
      'minSentimentScore',
      'minQualityScore'
    ],
    raw: true
  });

  const baseWhere = {
    userId,
    advertisementScore: { [Op.gte]: settings?.minAdvertisementScore ?? 0 },
    sentimentScore: { [Op.gte]: settings?.minSentimentScore ?? 0 },
    qualityScore: { [Op.gte]: settings?.minQualityScore ?? 0 }
  };

  applyClusterViewFilter(baseWhere, clusterView);

  return baseWhere;
};

const loadOverviewTotals = async baseWhere => {
  const totals = await Article.findOne({
    where: baseWhere,
    attributes: [
      [Sequelize.literal("COUNT(CASE WHEN status = 'unread' THEN 1 END)"), 'unreadCount'],
      [Sequelize.literal("COUNT(CASE WHEN status = 'read' THEN 1 END)"), 'readCount'],
      [Sequelize.literal("COUNT(CASE WHEN favoriteInd = 1 THEN 1 END)"), 'favoriteCount'],
      [Sequelize.literal("SUM(CASE WHEN clickedAmount > 0 THEN 1 ELSE 0 END)"), 'clickedCount'],
      [Sequelize.literal("COUNT(CASE WHEN hotInd = 1 THEN 1 END)"), 'hotCount']
    ],
    raw: true
  });

  return {
    unreadCount: Number(totals?.unreadCount) || 0,
    readCount: Number(totals?.readCount) || 0,
    favoriteCount: Number(totals?.favoriteCount) || 0,
    clickedCount: Number(totals?.clickedCount) || 0,
    hotCount: Number(totals?.hotCount) || 0
  };
};

const loadGroupedFeedCounts = baseWhere => Feed.findAll({
  include: [{
    model: Article,
    attributes: [],
    where: baseWhere
  }],
  attributes: [
    'categoryId',
    ['id', 'feedId'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`status` = 'unread' THEN 1 END)"), 'unreadCount'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`status` = 'read' THEN 1 END)"), 'readCount'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`favoriteInd` = 1 THEN 1 END)"), 'favoriteCount'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`hotInd` = 1 THEN 1 END)"), 'hotCount'],
    [Sequelize.literal("SUM(CASE WHEN `articles`.`clickedAmount` > 0 THEN 1 ELSE 0 END)"), 'clickedCount']
  ],
  group: ['feeds.categoryId', 'feeds.id'],
  order: ['id'],
  raw: true
});

const mergeCountsIntoStructure = (categories, groupedRows) => {
  const { feedMap } = buildCategoryFeedMaps(categories);

  groupedRows.forEach(row => {
    const feedEntry = feedMap[row.feedId];
    if (!feedEntry) return;

    const unread = Number(row.unreadCount) || 0;
    const read = Number(row.readCount) || 0;
    const favorite = Number(row.favoriteCount) || 0;
    const hot = Number(row.hotCount) || 0;
    const clicked = Number(row.clickedCount) || 0;

    feedEntry.feed.unreadCount = unread;
    feedEntry.feed.readCount = read;
    feedEntry.feed.favoriteCount = favorite;
    feedEntry.feed.hotCount = hot;
    feedEntry.feed.clickedCount = clicked;

    feedEntry.category.unreadCount += unread;
    feedEntry.category.readCount += read;
    feedEntry.category.favoriteCount += favorite;
    feedEntry.category.hotCount += hot;
    feedEntry.category.clickedCount += clicked;
  });

  return categories;
};

export const getOverviewLite = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    const categoriesRaw = await loadCategoriesStructure(userId);
    const categories = buildCategoriesStructure(categoriesRaw);

    return res.status(200).json({
      total: 0,
      readCount: 0,
      unreadCount: 0,
      favoriteCount: 0,
      hotCount: 0,
      clickedCount: 0,
      categories
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json(err);
  }
};

export const getOverviewCounts = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    const clusterView = String(req.body?.clusterView || 'all');
    const [baseWhere, categoriesRaw] = await Promise.all([
      buildOverviewWhere({ userId, clusterView }),
      loadCategoriesStructure(userId)
    ]);

    const categories = buildCategoriesStructure(categoriesRaw);
    const [totals, grouped] = await Promise.all([
      loadOverviewTotals(baseWhere),
      loadGroupedFeedCounts(baseWhere)
    ]);

    mergeCountsIntoStructure(categories, grouped);

    return res.status(200).json({
      total: totals.unreadCount + totals.readCount,
      ...totals,
      categories
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json(err);
  }
};

export const getOverview = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    const clusterView = String(req.body?.clusterView || 'all');
    const [baseWhere, categoriesRaw] = await Promise.all([
      buildOverviewWhere({ userId, clusterView }),
      loadCategoriesStructure(userId)
    ]);
    const categories = buildCategoriesStructure(categoriesRaw);
    const [totals, grouped] = await Promise.all([
      loadOverviewTotals(baseWhere),
      loadGroupedFeedCounts(baseWhere)
    ]);

    mergeCountsIntoStructure(categories, grouped);

    return res.status(200).json({
      total: totals.unreadCount + totals.readCount,
      ...totals,
      categories
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json(err);
  }
};

export const categoryUpdateOrder = async (req, res, _next) => {

  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  //categories are received in the preferred order
  const order = req.body.order;

  if (order === undefined) {
    return res.status(400).json({
      message: "order is not set"
    });
  }

  try {
    if (order.length > 0) {
      //start counting
      let count = 0;
      order.forEach(item => {
        Category.update({
          categoryOrder: count
        }, {
          where: {
            userId: userId,
            id: item
          }
        });
        //increase count
        count++;
      });
    }

    return res.status(200).json("order updated");
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export const feedChangeCategory = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  //categories are received in the preferred order
  const feedId = req.body.feedId;
  const categoryId = req.body.categoryId;

  if (feedId === undefined || categoryId === undefined) {
    return res.status(400).json({
      message: "feedId or categoryId is not set"
    });
  }

  try {
    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId: userId
      }
    })

    const category = await Category.findOne({
      where: {
        id: categoryId,
        userId: userId
      }
    })

    if (!feed || !category) {
      return res.status(404).json({
        message: "Feed or category not found"
      });
    }

    if (feed && category) {
      feed
        .update({
          categoryId: req.body.categoryId
        }, { where: { userId: userId } })
        .then(() => res.status(200).json(feed))
        .catch(error => res.status(400).json(error));
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

export default {
  getOverview,
  getOverviewLite,
  getOverviewCounts,
  categoryUpdateOrder,
  feedChangeCategory
}