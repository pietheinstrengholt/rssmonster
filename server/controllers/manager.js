import db from '../models/index.js';
const { Feed, Category, Article, Setting } = db;

import Sequelize from "sequelize";
import { Op } from 'sequelize';

export const getOverview = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    /* --------------------------------------------------
     * Settings & base filter
     * -------------------------------------------------- */
    const settings = await Setting.findOne({
      where: { userId },
      attributes: [
        'minAdvertisementScore',
        'minSentimentScore',
        'minQualityScore'
      ],
      raw: true
    });

    const clusterView = String(req.body?.clusterView || 'all');

    const baseWhere = {
      userId,
      advertisementScore: { [Op.gte]: settings?.minAdvertisementScore ?? 0 },
      sentimentScore: { [Op.gte]: settings?.minSentimentScore ?? 0 },
      qualityScore: { [Op.gte]: settings?.minQualityScore ?? 0 }
    };

    if (clusterView !== 'all') {
      baseWhere[Op.or] = [
        {
          id: {
            [Op.in]: Sequelize.literal(
              `(SELECT representativeArticleId FROM article_clusters)`
            )
          }
        },
        {
          clusterId: {
            [Op.is]: null
          }
        }
      ];
    }

    /* --------------------------------------------------
     * Global counts
     * -------------------------------------------------- */
    const totals = await Article.findOne({
      where: baseWhere,
      attributes: [
        [Sequelize.literal("COUNT(CASE WHEN status = 'unread' THEN 1 END)"), 'unreadCount'],
        [Sequelize.literal("COUNT(CASE WHEN status = 'read' THEN 1 END)"), 'readCount'],
        [Sequelize.literal("COUNT(CASE WHEN starInd = 1 THEN 1 END)"), 'starCount'],
        [Sequelize.literal("SUM(CASE WHEN clickedAmount > 0 THEN 1 ELSE 0 END)"), 'clickedCount'],
        [Sequelize.literal("COUNT(CASE WHEN hotInd = 1 THEN 1 END)"), 'hotCount']
      ],
      raw: true
    });

    const unreadCount  = Number(totals.unreadCount)  || 0;
    const readCount    = Number(totals.readCount)    || 0;
    const starCount    = Number(totals.starCount)    || 0;
    const clickedCount = Number(totals.clickedCount) || 0;
    const hotCount     = Number(totals.hotCount)     || 0;

    /* --------------------------------------------------
     * Categories + feeds
     * -------------------------------------------------- */
    const categoriesRaw = await Category.findAll({
      where: { userId },
      include: [{
        model: Feed,
        required: false
      }],
      order: ['categoryOrder', 'name']
    });

    // flatten Sequelize instances
    const categories = categoriesRaw.map(c => {
      const category = c.get({ plain: true });

      category.readCount = 0;
      category.unreadCount = 0;
      category.starCount = 0;
      category.hotCount = 0;
      category.clickedCount = 0;

      category.feeds = (category.feeds || []).map(f => ({
        ...f,
        readCount: 0,
        unreadCount: 0,
        starCount: 0,
        hotCount: 0,
        clickedCount: 0
      }));

      return category;
    });

    /* --------------------------------------------------
     * Index categories & feeds for O(1) lookup
     * -------------------------------------------------- */
    const categoryMap = {};
    const feedMap = {};

    categories.forEach(category => {
      categoryMap[category.id] = category;
      category.feeds.forEach(feed => {
        feedMap[feed.id] = { feed, category };
      });
    });

    /* --------------------------------------------------
     * Grouped feed counts
     * -------------------------------------------------- */
    const grouped = await Feed.findAll({
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
        [Sequelize.literal("COUNT(CASE WHEN `articles`.`starInd` = 1 THEN 1 END)"), 'starCount'],
        [Sequelize.literal("SUM(CASE WHEN `articles`.`clickedAmount` > 0 THEN 1 ELSE 0 END)"), 'clickedCount']
      ],
      group: ['feeds.categoryId', 'feeds.id'],
      order: ['id'],
      raw: true
    });

    /* --------------------------------------------------
     * Merge counts into categories & feeds
     * -------------------------------------------------- */
    grouped.forEach(row => {
      const feedEntry = feedMap[row.feedId];
      if (!feedEntry) return;

      const unread  = Number(row.unreadCount)  || 0;
      const read    = Number(row.readCount)    || 0;
      const star    = Number(row.starCount)    || 0;
      const clicked = Number(row.clickedCount) || 0;

      // feed
      feedEntry.feed.unreadCount  = unread;
      feedEntry.feed.readCount    = read;
      feedEntry.feed.starCount    = star;
      feedEntry.feed.clickedCount = clicked;

      // category totals
      feedEntry.category.unreadCount  += unread;
      feedEntry.category.readCount    += read;
      feedEntry.category.starCount    += star;
      feedEntry.category.clickedCount += clicked;
    });

    /* --------------------------------------------------
     * Response
     * -------------------------------------------------- */
    return res.status(200).json({
      total: unreadCount + readCount,
      readCount,
      unreadCount,
      starCount,
      hotCount,
      clickedCount,
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
  categoryUpdateOrder,
  feedChangeCategory
}