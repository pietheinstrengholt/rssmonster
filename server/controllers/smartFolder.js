'use strict';

import db from '../models/index.js';
import { Op, fn, col, literal } from 'sequelize';
import { searchArticles } from "../services/articleSearch/articleSearch.service.js";
import {
  ArticleExpressionValidationError,
  validateArticleExpression
} from '../services/articleSearch/articleQueryParser.service.js';
import { fetchFeedIds } from '../services/articleSearch/articleSearchDataAccess.service.js';
import { getSmartFolderRecommendations } from '../services/smartFolders/smartFolderLLM.js';
const { Article, Feed, Tag, SmartFolder, Setting } = db;

const SMART_FOLDER_COUNT_CONCURRENCY = 4;

const mapWithConcurrency = async (items, limit, mapper) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = Array(items.length);
  let index = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      while (index < items.length) {
        const currentIndex = index++;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }
  );

  await Promise.all(workers);
  return results;
};

const getSmartFolderCountsForUser = async userId => {
  const [smartFolders, userSettings, resolvedFeedIds] = await Promise.all([
    SmartFolder.findAll({
      where: { userId },
      attributes: ['id', 'name', 'query', 'limitCount'],
      order: [['name', 'ASC']]
    }),
    Setting.findOne({
      where: { userId },
      attributes: ['minAdvertisementScore', 'minSentimentScore', 'minQualityScore']
    }),
    fetchFeedIds({ userId, categoryId: '%', feedId: '%' })
  ]);

  const minAdvertisementScore = userSettings?.minAdvertisementScore ?? 0;
  const minSentimentScore = userSettings?.minSentimentScore ?? 0;
  const minQualityScore = userSettings?.minQualityScore ?? 0;

  return mapWithConcurrency(smartFolders, SMART_FOLDER_COUNT_CONCURRENCY, async folder => {
    try {
      const result = await searchArticles({
        userId,
        search: folder.query,
        minAdvertisementScore,
        minSentimentScore,
        minQualityScore,
        resolvedFeedIds,
        smartFolderSearch: true,
        limitCount: folder.limitCount || 50,
        countOnly: true
      });

      return {
        id: folder.id,
        ArticleCount: result.articleCount
      };
    } catch {
      return {
        id: folder.id,
        ArticleCount: 0
      };
    }
  });
};

/* ---------------------------------------------------
 * GET /api/smartfolders
 * --------------------------------------------------- */
const getSmartFolders = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const withCounts = req.query?.withCounts !== 'false';

    const smartFolders = await SmartFolder.findAll({
      where: { userId },
      attributes: ['id', 'name', 'query', 'limitCount', 'markAsReadOnScroll'],
      order: [['name', 'ASC']]
    });

    if (withCounts) {
      const counts = await getSmartFolderCountsForUser(userId);
      const countMap = new Map(counts.map(item => [item.id, item.ArticleCount]));

      for (const folder of smartFolders) {
        folder.dataValues.ArticleCount = countMap.get(folder.id) ?? 0;
      }
    }

    res.status(200).json({ total: smartFolders.length, smartFolders });
  } catch (err) {
    next(err);
  }
};

const getSmartFolderCounts = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const smartFolders = await getSmartFolderCountsForUser(userId);
    res.setHeader('Cache-Control', 'private, no-store');
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

    const payload = smartFolders
      .filter(sf => sf && (sf.name || sf.query))
      .map(sf => ({
        userId,
        name: sf.name || '',
        query: sf.query || '',
        limitCount: sf.limitCount || 50,
        markAsReadOnScroll: sf.markAsReadOnScroll === undefined
          ? false
          : sf.markAsReadOnScroll
      }));

    for (const [index, smartFolder] of payload.entries()) {
      if (typeof smartFolder.markAsReadOnScroll !== 'boolean') {
        return res.status(400).json({
          error: {
            code: 'SMART_FOLDER_INVALID_MARK_AS_READ_ON_SCROLL',
            message: 'markAsReadOnScroll must be a boolean.',
            index
          }
        });
      }

      try {
        const parsedExpression = validateArticleExpression(smartFolder.query);
        if (
          smartFolder.markAsReadOnScroll &&
          parsedExpression.filters.unread !== true
        ) {
          return res.status(400).json({
            error: {
              code: 'SMART_FOLDER_MARK_AS_READ_ON_SCROLL_REQUIRES_UNREAD',
              message: 'markAsReadOnScroll requires unread:true.',
              index
            }
          });
        }
      } catch (error) {
        if (error instanceof ArticleExpressionValidationError) {
          return res.status(400).json({
            error: {
              code: error.code,
              message: error.message,
              index
            }
          });
        }
        throw error;
      }
    }

    await SmartFolder.destroy({ where: { userId } });

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
  { days = 365, maxFavoriteTitles = 500 } = {}
) => {
  const since = new Date(Date.now() - days * 86400000);

  const [articleStats, feeds, tagStats, favoriteArticles, existingSmartFolders] = await Promise.all([
    Article.findAll({
      where: {
        userId,
        publishedAt: { [Op.gte]: since }
      },
      attributes: [
        'feedId',
        [fn('COUNT', col('id')), 'total'],
        [fn('SUM', literal(`CASE WHEN status = 'unread' THEN 1 ELSE 0 END`)), 'unread'],
        [fn('SUM', literal(`CASE WHEN status = 'read' THEN 1 ELSE 0 END`)), 'read'],
        [fn('SUM', literal(`CASE WHEN clickedAmount > 0 THEN 1 ELSE 0 END`)), 'clicked'],
        [fn('SUM', literal(`CASE WHEN favoriteInd = 1 THEN 1 ELSE 0 END`)), 'favorite']
      ],
      group: ['feedId'],
      raw: true
    }),
    Feed.findAll({
      where: { userId },
      attributes: ['id', 'feedName'],
      raw: true
    }),
    Tag.findAll({
      where: { userId },
      attributes: [
        'name',
        [fn('COUNT', col('name')), 'count']
      ],
      group: ['name'],
      order: [[literal('count'), 'DESC']],
      raw: true
    }),
    Article.findAll({
      where: {
        userId,
        favoriteInd: 1,
        publishedAt: { [Op.gte]: since }
      },
      attributes: ['title', 'publishedAt', 'feedId'],
      order: [['publishedAt', 'DESC']],
      limit: maxFavoriteTitles,
      raw: true
    }),
    SmartFolder.findAll({
      where: { userId },
      attributes: ['name', 'query'],
      raw: true
    })
  ]);

  const feedMap = new Map();
  for (const feed of feeds) {
    feedMap.set(feed.id, {
      name: feed.feedName,
      total: 0,
      unread: 0,
      read: 0,
      clicked: 0,
      favorite: 0
    });
  }

  for (const stat of articleStats) {
    const feed = feedMap.get(stat.feedId);
    if (!feed) continue;

    feed.total = Number(stat.total) || 0;
    feed.unread = Number(stat.unread) || 0;
    feed.read = Number(stat.read) || 0;
    feed.clicked = Number(stat.clicked) || 0;
    feed.favorite = Number(stat.favorite) || 0;
  }

  /* -----------------------------------
   * Engagement summary
   * ----------------------------------- */
  const engagement = {
    totalArticles: 0,
    unread: 0,
    read: 0,
    clicked: 0,
    favorite: 0
  };

  for (const f of feedMap.values()) {
    engagement.totalArticles += f.total;
    engagement.unread += f.unread;
    engagement.read += f.read;
    engagement.clicked += f.clicked;
    engagement.favorite += f.favorite;
  }

  // Map feedId to feedName
  const feedNames = new Map();
  for (const feed of feeds) {
    feedNames.set(feed.id, feed.feedName);
  }

  return {
    window: { days },
    engagement,
    feeds: Array.from(feedMap.values()),
    tags: tagStats.map(t => ({
      name: t.name,
      count: Number(t.count) || 0
    })),
    favoriteItems: favoriteArticles.map(a => ({
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
      f.favorite > 0 ||
      (f.total > 0 && f.unread / f.total >= 0.7)
    )
    .map(f => ({
      name: f.name,
      unreadRatio: f.total
        ? Number((f.unread / f.total).toFixed(2))
        : 0,
      favorite: f.favorite,
      volume: f.total
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15)
    .map(({ name, unreadRatio, favorite }) => ({
      name,
      unreadRatio,
      favorite
    }));

  /* -----------------------------------
   * Tag compression
   * ----------------------------------- */
  const topTags = raw.tags.slice(0, 12).map(t => t.name);

  /* -----------------------------------
   * Favorite article overview
   * ----------------------------------- */
  const favoriteItems = Array.isArray(raw.favoriteItems)
    ? raw.favoriteItems.slice(0, 10).map(item => ({
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
      favoriteArticles: raw.engagement.favorite
    },

    feeds,

    interests: {
      topTags,
      longTailTagCount: Math.max(raw.tags.length - topTags.length, 0)
    },

    favoriteItems,

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
  getSmartFolderCounts,
  postSmartFolder,
  collectSmartFolderSignals,
  getSmartFolderInsights
};
