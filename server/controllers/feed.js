import db from '../models/index.js';
const { Feed, Article, Category } = db;

import discoverRssLink from "../util/discoverRssLink.js";
import { rediscoverRssUrl } from '../util/rediscoverRssUrl.js';
import parseFeed from "../util/parser.js";
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/auth.js';
import crawlController from './crawl.js';
import crawlJobManager from '../util/crawlJobManager.js';

const findOwnedCategory = (categoryId, userId) => Category.findOne({
  where: {
    id: categoryId,
    userId
  }
});

const UPDATE_INTERVAL_MINUTES = [null, 0, 5, 15, 30, 60, 120, 360, 720, 1440];

// This function normalizes feed tag input from arrays or text fields.
const normalizeFeedTags = value => {
  if (typeof value === 'undefined') {
    return [];
  }

  const tags = Array.isArray(value)
    ? value
    : String(value).split(/[\s,]+/);

  return tags
    .map(tag => String(tag).trim())
    .filter(Boolean);
};

// This function validates the feed update interval selector value.
const normalizeUpdateIntervalMinutes = value => {
  if (value === null || value === '') {
    return null;
  }

  const interval = Number(value);

  if (!Number.isInteger(interval) || !UPDATE_INTERVAL_MINUTES.includes(interval)) {
    throw new Error('Invalid update interval');
  }

  return interval;
};

// This function validates boolean feed processing controls.
const normalizeBooleanControl = (value, fieldName) => {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error(`Invalid ${fieldName}`);
};

const getFeeds = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feeds = await Feed.findAll({
      where: {
        userId: userId
      },
      order: [["feedName", "ASC"]]
    });
    // Aggregate article counts per feed for this user
    const articleCounts = await Article.findAll({
      attributes: [
        'feedId',
        [Article.sequelize.fn('COUNT', Article.sequelize.col('id')), 'articleCount'],
        [Article.sequelize.fn('COUNT', Article.sequelize.col('eventId')), 'clusteredArticleCount']
      ],
      where: { userId: userId },
      group: ['feedId'],
      raw: true
    });

    // Calculate ingestion rate (average articles per day over last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ingestionRates = await Article.findAll({
      attributes: [
        'feedId',
        [Article.sequelize.fn('COUNT', Article.sequelize.col('id')), 'articleCount30Days']
      ],
      where: { 
        userId: userId,
        published: { [db.Sequelize.Op.gte]: thirtyDaysAgo }
      },
      group: ['feedId'],
      raw: true
    });

    const countsByFeedId = articleCounts.reduce((acc, row) => {
      const articleCount = Number(row.articleCount) || 0;
      const clusteredArticleCount = Number(row.clusteredArticleCount) || 0;

      acc[row.feedId] = {
        articleCount,
        clusteredArticleCount,
        clusterCoveragePct: articleCount > 0
          ? Math.round((clusteredArticleCount * 1000) / articleCount) / 10
          : 0
      };
      return acc;
    }, {});

    const ingestionByFeedId = ingestionRates.reduce((acc, row) => {
      // Average per day over 30 days
      acc[row.feedId] = Math.round((Number(row.articleCount30Days) || 0) / 30 * 10) / 10;
      return acc;
    }, {});

    const feedsWithCounts = feeds.map(feed => ({
      ...feed.toJSON(),
      articleCount: countsByFeedId[feed.id]?.articleCount ?? 0,
      articlesPerDay: ingestionByFeedId[feed.id] ?? 0,
      clusteredArticleCount: countsByFeedId[feed.id]?.clusteredArticleCount ?? 0,
      clusterCoveragePct: countsByFeedId[feed.id]?.clusterCoveragePct ?? 0
    }));

    return res.status(200).json({ feeds: feedsWithCounts });
  } catch (err) {
    console.error('Error in getFeeds:', err);
    return res.status(500).json({ error: err.message });
  }
};

const getFeed = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feedId = req.params.feedId;
    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId: userId
      }
    });
    if (!feed) {
      return res.status(404).json({ message: 'Feed not found' });
    }
    return res.status(200).json({ feed });
  } catch (err) {
    console.error('Error in getFeed:', err);
    return res.status(500).json({ error: err.message });
  }
};

const updateFeed = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feedId = req.params.feedId;
    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId: userId
      }
    });
    if (!feed) {
      return res.status(404).json({ message: 'Feed not found' });
    }

    const category = await findOwnedCategory(req.body.categoryId, userId);
    if (!category) {
      return res.status(400).json({ error: 'Category not found' });
    }

    let updateIntervalMinutes;
    let feedTags;
    let generateEmbeddings;
    let applyAiAnalysis;

    try {
      updateIntervalMinutes = typeof req.body.updateIntervalMinutes === 'undefined'
        ? feed.updateIntervalMinutes
        : normalizeUpdateIntervalMinutes(req.body.updateIntervalMinutes);
      feedTags = typeof req.body.feedTags === 'undefined'
        ? feed.feedTags
        : normalizeFeedTags(req.body.feedTags);
      generateEmbeddings = typeof req.body.generateEmbeddings === 'undefined'
        ? feed.generateEmbeddings
        : normalizeBooleanControl(req.body.generateEmbeddings, 'generateEmbeddings');
      applyAiAnalysis = typeof req.body.applyAiAnalysis === 'undefined'
        ? feed.applyAiAnalysis
        : normalizeBooleanControl(req.body.applyAiAnalysis, 'applyAiAnalysis');
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    await feed.update({
      userId: userId,
      feedName: req.body.feedName,
      feedDesc: req.body.feedDesc,
      categoryId: category.id,
      url: req.body.url,
      favicon: req.body.favicon,
      status: req.body.status,
      updateIntervalMinutes,
      feedTags,
      generateEmbeddings,
      applyAiAnalysis,
      errorCount: 0
    });
    return res.status(200).json({ feed });
  } catch (err) {
    console.error('Error in updateFeed:', err);
    return res.status(500).json({ error: err.message });
  }
};

const newFeed = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    // Map crawlSince selector (e.g., '7d', '1m', '3m', '1y', 'all') to a Date or null
    const toCrawlSinceDate = (value) => {
      const now = new Date();
      const v = (value || '7d').toString();
      try {
        switch (v) {
          case '7d': {
            const d = new Date(now); d.setDate(d.getDate() - 7); return d;
          }
          case '1m': {
            const d = new Date(now); d.setMonth(d.getMonth() - 1); return d;
          }
          case '3m': {
            const d = new Date(now); d.setMonth(d.getMonth() - 3); return d;
          }
          case '1y': {
            const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d;
          }
          case 'all':
            return null; // no limit
          default: {
            // If an ISO date string or timestamp is provided, attempt to parse
            const parsed = new Date(v);
            return isNaN(parsed.getTime()) ? new Date(now.setDate(now.getDate() - 7)) : parsed;
          }
        }
      } catch {
        const d = new Date(now); d.setDate(d.getDate() - 7); return d;
      }
    };

    const crawlSince = toCrawlSinceDate(req.body.crawlSince);
    const category = await findOwnedCategory(req.body.categoryId, userId);
    if (!category) {
      return res.status(400).json({ error: 'Category not found' });
    }

    const feed = await Feed.create({
      userId: req.userData.userId,
      categoryId: category.id,
      feedName: req.body.feedName,
      feedDesc: req.body.feedDesc,
      feedType: req.body.feedType,
      url: req.body.url,
      favicon: req.body.favicon,
      status: req.body.status,
      crawlSince
    });
    return res.status(201).json({ feed });
  } catch (err) {
    console.error('Error in newFeed:', err);
    return res.status(500).json({ error: err.message });
  }
};

const deleteFeed = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feedId = req.params.feedId;
    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId: userId
      }
    });
    if (!feed) {
      return res.status(404).json({ message: 'Feed not found' });
    }
    //delete all articles
    await Article.destroy({
      where: { feedId: feed.id }
    });
    //delete feed
    await feed.destroy();
    return res.status(204).send();
  } catch (err) {
    console.error('Error in deleteFeed:', err);
    return res.status(500).json({ error: err.message });
  }
};

const validateFeed = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const categoryId = req.body.categoryId;

    const discoveryResult = await discoverRssLink.discoverRssLink(req.body.url);
    console.log("Discovery result:", discoveryResult);

    // Cloudflare bot protection detected — inform front end
    if (discoveryResult && typeof discoveryResult === 'object' && discoveryResult.cloudflare) {
      return res.status(403).json({
        error_msg: 'This feed is protected by Cloudflare bot detection and cannot be validated automatically.',
        cloudflare: true,
        feedUrl: discoveryResult.url
      });
    }

    const url = typeof discoveryResult === 'string' ? discoveryResult : undefined;

    if (typeof url === 'undefined') {
      return res.status(400).json({
        error_msg: 'Feed url is invalid. Are you sure the RSS feed is correct?'
      });
    }
    
    if (typeof categoryId === 'undefined') {
      return res.status(400).json({
        error_msg: 'Category is invalid.'
      });
    }

    const feedItem = await parseFeed.process(url);
    if (!feedItem) {
      return res.status(400).json({
        error_msg: 'Feed has no meta attributes'
      });
    }

    //extract feed data
    const feed = feedItem.feed;

    //sanity check
    if (!feed || typeof feed !== "object") {
      throw new Error("Invalid feed structure");
    }

    //use self link as rss url if available
    const feedUrl = feedItem.self || url;

    //check if feed already exists
    const existingFeed = await Feed.findOne({
      where: {
        userId: userId,
        url: feedUrl
      }
    });
    
    if (existingFeed) {
      return res.status(409).json({
        error_msg: 'Feed already exists.'
      });
    }

    // --- Resolve feed title
    const feedName =
      feed?.title ||
      null;

    // --- Resolve feed description
    const feedDesc =
      feedItem.format === "rss"
        ? feed?.description || null
        : null;
    
    // --- Resolve favicon / image
    const favicon =
      feedItem.format === "rss"
        ? feed?.image?.url || null
        : null;

    //return feed data to the frontend, the frontend will create the feed by invoking the newFeed endpoint
    return res.status(200).json({
      userId,
      categoryId,
      feedName,
      feedDesc,
      feedType: feedItem.format || null,
      url: feedItem.self || url || req.body.url,
      favicon
    });
  } catch (err) {
    console.error('Error in validateFeed:', err);
    return res.status(500).json({
      error_msg: err.message
    });
  }
};

const rediscoverFeedRss = async (req, res) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const feedId = req.params.feedId;

    const feed = await Feed.findOne({
      where: { id: feedId, userId }
    });

    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    const result = await rediscoverRssUrl({
      feedName: feed.feedName,
      websiteUrl: feed.url,
      oldUrl: feed.url
    });

    if (!result.url) {
      return res.status(404).json({
        error: 'No RSS feed found',
        confidence: result.confidence,
        reason: result.reason
      });
    }

    return res.status(200).json({
      suggestedUrl: result.url,
      confidence: result.confidence,
      reason: result.reason
    });

  } catch (err) {
    console.error('Error in rediscoverFeedRss:', err);
    return res.status(500).json({ error: err.message });
  }
};

const muteFeed = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feedId = req.params.feedId;
    if (!feedId) {
      return res.status(400).json({ error: 'Bad request: missing feedId' });
    }

    const mutedUntil = req.body.mutedUntil;
    if (!mutedUntil) {
      return res.status(400).json({ error: 'Bad request: missing mutedUntil' });
    }

    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId: userId
      }
    });

    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    await feed.update({ mutedUntil: new Date(mutedUntil) });

    return res.status(200).json({ 
      message: 'Feed muted successfully', 
      feedId,
      mutedUntil 
    });
  } catch (err) {
    console.error('Error in muteFeed:', err);
    return res.status(500).json({ error: err.message });
  }
};

const startRefresh = async (req, res) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const activeJob = crawlJobManager.getActiveJobForUser(userId);
    if (activeJob) {
      return res.status(200).json({ jobId: activeJob.id, reused: true });
    }

    const jobId = crawlJobManager.createJob(userId);
    crawlJobManager.publishEvent(jobId, {
      type: 'progress',
      stage: 'queued',
      message: 'Refresh job queued'
    });

    crawlController.performCrawlWithEventClustering(userId, {
      onProgress: (event) => {
        crawlJobManager.publishEvent(jobId, event);
      }
    })
      .catch((err) => {
        console.error('Error in startRefresh async crawl:', err);
        crawlJobManager.publishEvent(jobId, {
          type: 'error',
          message: err?.message || 'Unknown refresh error'
        });
      });

    return res.status(200).json({ jobId });
  } catch (err) {
    console.error('Error in startRefresh:', err);
    return res.status(500).json({ error: err.message });
  }
};

const streamRefreshEvents = async (req, res) => {
  try {
    let userId = req.userData?.userId || null;

    // EventSource cannot set Authorization headers, so allow token in query for this SSE endpoint.
    if (!userId && req.query?.token) {
      try {
        const decoded = jwt.verify(req.query.token, getJwtSecret());
        userId = decoded?.userId || null;
      } catch {
        userId = null;
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const { jobId } = req.params;
    const job = crawlJobManager.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Refresh job not found' });
    }

    if (job.userId && job.userId !== userId) {
      return res.status(404).json({ error: 'Refresh job not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    res.write(': connected\n\n');

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeatId);
      crawlJobManager.unsubscribe(jobId, res);
    };

    const heartbeatId = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        cleanup();
        try { res.end(); } catch { /* ignore */ }
      }
    }, 15_000);

    req.on('close', () => {
      cleanup();
    });

    const subscribed = crawlJobManager.subscribe(jobId, req, res);
    if (!subscribed) {
      cleanup();
    }
  } catch (err) {
    console.error('Error in streamRefreshEvents:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
    return res.end();
  }
};

export default {
  getFeeds,
  getFeed,
  updateFeed,
  newFeed,
  deleteFeed,
  validateFeed,
  rediscoverFeedRss,
  muteFeed,
  startRefresh,
  streamRefreshEvents
}
