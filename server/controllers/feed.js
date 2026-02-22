import db from '../models/index.js';
const { Feed, Article } = db;

import discoverRssLink from "../util/discoverRssLink.js";
import { rediscoverRssUrl } from '../util/rediscoverRssUrl.js';
import parseFeed from "../util/parser.js";

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
        [Article.sequelize.fn('COUNT', Article.sequelize.col('id')), 'articleCount']
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
      acc[row.feedId] = Number(row.articleCount) || 0;
      return acc;
    }, {});

    const ingestionByFeedId = ingestionRates.reduce((acc, row) => {
      // Average per day over 30 days
      acc[row.feedId] = Math.round((Number(row.articleCount30Days) || 0) / 30 * 10) / 10;
      return acc;
    }, {});

    const feedsWithCounts = feeds.map(feed => ({
      ...feed.toJSON(),
      articleCount: countsByFeedId[feed.id] ?? 0,
      articlesPerDay: ingestionByFeedId[feed.id] ?? 0
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
    const feed = await Feed.findByPk(feedId, {
      where: {
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
    const feed = await Feed.findByPk(feedId, {
      where: {
        userId: userId
      }
    });
    if (!feed) {
      return res.status(404).json({ message: 'Feed not found' });
    }
    await feed.update({
      userId: userId,
      feedName: req.body.feedName,
      feedDesc: req.body.feedDesc,
      categoryId: req.body.categoryId,
      url: req.body.url,
      favicon: req.body.favicon,
      status: req.body.status,
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

    const feed = await Feed.create({
      userId: req.userData.userId,
      categoryId: req.body.categoryId,
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
    const feed = await Feed.findByPk(feedId, {
      where: {
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

    const feed = await Feed.findByPk(feedId, {
      where: { userId }
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

export default {
  getFeeds,
  getFeed,
  updateFeed,
  newFeed,
  deleteFeed,
  validateFeed,
  rediscoverFeedRss,
  muteFeed
}