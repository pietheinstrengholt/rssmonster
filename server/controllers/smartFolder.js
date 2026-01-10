'use strict';

import db from '../models/index.js';
import { Op, fn, col, literal } from 'sequelize';
import { searchArticles } from "../util/articleSearch.service.js";
import { getSmartFolderRecommendations } from '../util/smartFolderLLM.js';
const { Article, Feed, Category, Tag, Action, SmartFolder } = db;

/* ---------------------------------------------------
 * GET /api/smartfolders
 * --------------------------------------------------- */
const getSmartFolders = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const smartFolders = await SmartFolder.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });

    for (const folder of smartFolders) {
      try {
        const result = await searchArticles({
          userId,
          search: folder.query
        });
        folder.dataValues.ArticleCount = result.itemIds.length;
      } catch {
        folder.dataValues.ArticleCount = 0;
      }
    }

    res.status(200).json({ total: smartFolders.length, smartFolders });
  } catch (err) {
    next(err);
  }
};

/* ---------------------------------------------------
 * POST /api/smartfolders
 * --------------------------------------------------- */
const postSmartFolder = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const smartFolders = Array.isArray(req.body?.smartFolders)
      ? req.body.smartFolders
      : [];

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    await SmartFolder.destroy({ where: { userId } });

    const payload = smartFolders
      .filter(sf => sf && (sf.name || sf.query))
      .map(sf => ({
        userId,
        name: sf.name || '',
        query: sf.query || '',
        limitCount: sf.limitCount || 50
      }));

    const created = payload.length
      ? await SmartFolder.bulkCreate(payload)
      : [];

    res.status(201).json({ total: created.length, smartFolders: created });
  } catch (err) {
    next(err);
  }
};

/* ---------------------------------------------------
 * Internal: collect Smart Folder insights (STEP 2)
 * Articles + Feeds + Tags
 * --------------------------------------------------- */
const collectSmartFolderSignals = async (
  userId,
  { days = 365, maxStarredTitles = 500 } = {}
) => {
  console.log(
    `Collecting Smart Folder signals (Articles + Feeds + Tags) for user ${userId} over last ${days} days`
  );

  const since = new Date(Date.now() - days * 86400000);

  /* -----------------------------------
   * Aggregate article stats per feed
   * ----------------------------------- */
  const articleStats = await Article.findAll({
    where: {
      userId,
      published: { [Op.gte]: since }
    },
    attributes: [
      'feedId',
      [fn('COUNT', col('id')), 'total'],
      [fn('SUM', literal(`CASE WHEN status = 'unread' THEN 1 ELSE 0 END`)), 'unread'],
      [fn('SUM', literal(`CASE WHEN status = 'read' THEN 1 ELSE 0 END`)), 'read'],
      [fn('SUM', literal(`CASE WHEN clickedInd = 1 THEN 1 ELSE 0 END`)), 'clicked'],
      [fn('SUM', literal(`CASE WHEN starInd = 1 THEN 1 ELSE 0 END`)), 'starred']
    ],
    group: ['feedId'],
    raw: true
  });

  /* -----------------------------------
   * Fetch feeds
   * ----------------------------------- */
  const feedList = await Feed.findAll({
    where: { userId },
    attributes: ['id', 'feedName', 'feedType', 'status'],
    raw: true
  });

  const feedMap = new Map();

  for (const feed of feedList) {
    feedMap.set(feed.id, {
      feedId: feed.id,
      name: feed.feedName,
      type: feed.feedType,
      status: feed.status,
      total: 0,
      unread: 0,
      read: 0,
      clicked: 0,
      starred: 0
    });
  }

  for (const stat of articleStats) {
    const feed = feedMap.get(stat.feedId);
    if (!feed) continue;

    feed.total = Number(stat.total) || 0;
    feed.unread = Number(stat.unread) || 0;
    feed.read = Number(stat.read) || 0;
    feed.clicked = Number(stat.clicked) || 0;
    feed.starred = Number(stat.starred) || 0;
  }

  /* -----------------------------------
   * Overall engagement summary
   * ----------------------------------- */
  const engagement = {
    totalArticles: 0,
    unread: 0,
    read: 0,
    clicked: 0,
    starred: 0
  };

  for (const feed of feedMap.values()) {
    engagement.totalArticles += feed.total;
    engagement.unread += feed.unread;
    engagement.read += feed.read;
    engagement.clicked += feed.clicked;
    engagement.starred += feed.starred;
  }

  /* -----------------------------------
   * Tag frequency (global, time-bound)
   * ----------------------------------- */
  const tagStats = await Tag.findAll({
    where: {
      userId
    },
    attributes: [
      'name',
      [fn('COUNT', col('name')), 'count']
    ],
    group: ['name'],
    order: [[literal('count'), 'DESC']],
    limit: 50,
    raw: true
  });

  /* -----------------------------------
   * Starred article titles (high signal)
   * ----------------------------------- */
  const starredArticles = await Article.findAll({
    where: {
      userId,
      starInd: 1,
      published: { [Op.gte]: since }
    },
    attributes: ['title'],
    order: [['published', 'DESC']],
    limit: maxStarredTitles,
    raw: true
  });

  /* -----------------------------------
   * Final insights payload (STEP 2)
   * ----------------------------------- */
  return {
    window: { days },
    engagement,
    feeds: Array.from(feedMap.values()),
    tags: tagStats.map(t => ({
      name: t.name,
      count: Number(t.count) || 0
    })),
    starredTitles: starredArticles.map(a => a.title)
  };
};

/* ---------------------------------------------------
 * GET /api/smartfolders/insights
 * --------------------------------------------------- */
const getSmartFolderInsights = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const days = Number(req.query.days) || 30;

    const insights = await collectSmartFolderSignals(userId, { days });
    console.log('Smart Folder insights collected:', insights);
    const recommendations = await getSmartFolderRecommendations({ insights });

    res.status(200).json({ insights, recommendations });
  } catch (err) {
    next(err);
  }
};

/* ---------------------------------------------------
 * Exports
 * --------------------------------------------------- */
export default {
  getSmartFolders,
  postSmartFolder,
  collectSmartFolderSignals,
  getSmartFolderInsights
};