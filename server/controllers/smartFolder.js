'use strict';

import db from '../models/index.js';
import { Op, fn, col, literal } from 'sequelize';
import { searchArticles } from "../util/articleSearch.service.js";
import { getSmartFolderRecommendations } from '../util/smartFolderLLM.js';
const { Article, Feed, Tag, SmartFolder } = db;

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
      order: [['name', 'ASC']]
    });

    for (const folder of smartFolders) {
      try {
        const result = await searchArticles({
          userId,
          search: folder.query,
          smartFolderSearch: true,
          limitCount: folder.limitCount || 50
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
  const feeds = await Feed.findAll({
    where: { userId },
    attributes: ['id', 'feedName'],
    raw: true
  });

  const feedMap = new Map();
  for (const feed of feeds) {
    feedMap.set(feed.id, {
      name: feed.feedName,
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
   * Engagement summary
   * ----------------------------------- */
  const engagement = {
    totalArticles: 0,
    unread: 0,
    read: 0,
    clicked: 0,
    starred: 0
  };

  for (const f of feedMap.values()) {
    engagement.totalArticles += f.total;
    engagement.unread += f.unread;
    engagement.read += f.read;
    engagement.clicked += f.clicked;
    engagement.starred += f.starred;
  }

  /* -----------------------------------
   * Tag stats (global)
   * ----------------------------------- */
  const tagStats = await Tag.findAll({
    where: { userId },
    attributes: [
      'name',
      [fn('COUNT', col('name')), 'count']
    ],
    group: ['name'],
    order: [[literal('count'), 'DESC']],
    raw: true
  });

  /* -----------------------------------
  * Starred articles (high signal)
  * ----------------------------------- */
  const starredArticles = await Article.findAll({
    where: {
      userId,
      starInd: 1,
      published: { [Op.gte]: since }
    },
    attributes: ['title', 'published', 'feedId'],
    order: [['published', 'DESC']],
    limit: maxStarredTitles,
    raw: true
  });

  // Map feedId to feedName
  const feedNames = new Map();
  for (const feed of feeds) {
    feedNames.set(feed.id, feed.feedName);
  }

  /* -----------------------------------
   * Current Smart Folders (to avoid duplicates)
   * ----------------------------------- */
  const existingSmartFolders = await SmartFolder.findAll({
    where: { userId },
    attributes: ['name', 'query'],
    raw: true
  });

  return {
    window: { days },
    engagement,
    feeds: Array.from(feedMap.values()),
    tags: tagStats.map(t => ({
      name: t.name,
      count: Number(t.count) || 0
    })),
    starredItems: starredArticles.map(a => ({
      feed: feedNames.get(a.feedId),
      title: a.title
    })),
    existingSmartFolders
  };
};

const distillSmartFolderInsights = (raw) => {
  /* -----------------------------------
   * Feed filtering + ranking
   * ----------------------------------- */
  const feeds = raw.feeds
    .filter(f =>
      f.total >= 5 ||
      f.starred > 0 ||
      (f.total > 0 && f.unread / f.total >= 0.7)
    )
    .map(f => ({
      name: f.name,
      unreadRatio: f.total
        ? Number((f.unread / f.total).toFixed(2))
        : 0,
      starred: f.starred,
      volume: f.total
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15)
    .map(({ name, unreadRatio, starred }) => ({
      name,
      unreadRatio,
      starred
    }));

  /* -----------------------------------
   * Tag compression
   * ----------------------------------- */
  const topTags = raw.tags.slice(0, 12).map(t => t.name);

  /* -----------------------------------
   * Starred article overview
   * ----------------------------------- */
  const starredItems = Array.isArray(raw.starredItems)
    ? raw.starredItems.slice(0, 10).map(item => ({
        feed: item.feed,
        title: item.title
      }))
    : [];

  /* -----------------------------------
   * Engagement ratios
   * ----------------------------------- */
  const unreadRatio =
    raw.engagement.totalArticles > 0
      ? Number(
          (raw.engagement.unread / raw.engagement.totalArticles).toFixed(2)
        )
      : 0;

  return {
    window: `last ${raw.window.days} days`,

    engagement: {
      unreadRatio,
      starredArticles: raw.engagement.starred
    },

    feeds,

    interests: {
      topTags,
      longTailTagCount: Math.max(raw.tags.length - topTags.length, 0)
    },

    starredItems,

    existingSmartFolders: raw.existingSmartFolders || []
  };
};

/* ---------------------------------------------------
 * GET /api/smartfolders/insights
 * --------------------------------------------------- */
const getSmartFolderInsights = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = Number(req.query.days) || 30;

    const rawInsights = await collectSmartFolderSignals(userId, { days });
    const distilledInsights = distillSmartFolderInsights(rawInsights);
    console.log('Distilled Smart Folder Insights:', distilledInsights);
    const recommendations = await getSmartFolderRecommendations({ distilledInsights });

    res.status(200).json({
      insights: distilledInsights,
      recommendations
    });
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