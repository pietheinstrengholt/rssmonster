import Feed from "../models/feed.js";
import Article from "../models/article.js";

import discoverRssLink from "../util/discoverRssLink.js";
import { rediscoverRssUrl } from '../util/rediscoverRssUrl.js';
import parseFeed from "../util/parser.js";

const getFeeds = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feeds = await Feed.findAll({
      where: {
        userId: userId
      }
    });
    return res.status(200).json({ feeds });
  } catch (err) {
    console.error('Error in getFeeds:', err);
    return res.status(500).json({ error: err.message });
  }
};

const getFeed = async (req, res, next) => {
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

const updateFeed = async (req, res, next) => {
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
      rssUrl: req.body.rssUrl,
      favicon: req.body.favicon,
      active: req.body.active,
      errorCount: 0
    });
    return res.status(200).json({ feed });
  } catch (err) {
    console.error('Error in updateFeed:', err);
    return res.status(500).json({ error: err.message });
  }
};

const newFeed = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const feed = await Feed.create({
      userId: req.userData.userId,
      categoryId: req.body.categoryId,
      feedName: req.body.feedName,
      feedDesc: req.body.feedDesc,
      feedType: req.body.feedType,
      url: req.body.url,
      rssUrl: req.body.rssUrl,
      favicon: req.body.favicon,
      active: req.body.active
    });
    return res.status(201).json({ feed });
  } catch (err) {
    console.error('Error in newFeed:', err);
    return res.status(500).json({ error: err.message });
  }
};

const deleteFeed = async (req, res, next) => {
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

const validateFeed = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const categoryId = req.body.categoryId;
    //resolve url
    const url = await discoverRssLink.discoverRssLink(req.body.url);

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

    const feeditem = await parseFeed.process(url);
    if (!feeditem) {
      return res.status(400).json({
        error_msg: 'Feed has no meta attributes'
      });
    }

    //check if feed already exists
    const existingFeed = await Feed.findOne({
      where: {
        userId: userId,
        url: feeditem.self
      }
    });
    
    if (existingFeed) {
      return res.status(409).json({
        error_msg: 'Feed already exists.'
      });
    }
    
    return res.status(200).json({
      userId: userId,
      categoryId: categoryId,
      feedName: feeditem.title || feeditem.meta.title,
      feedDesc: feeditem.description || feeditem.meta.description || null,
      feedType: feeditem.version || null,
      url: req.body.url,
      rssUrl: feeditem.self,
      favicon: feeditem.image
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
      oldRssUrl: feed.rssUrl
    });

    if (!result.rssUrl) {
      return res.status(404).json({
        error: 'No RSS feed found',
        confidence: result.confidence,
        reason: result.reason
      });
    }

    return res.status(200).json({
      suggestedRssUrl: result.rssUrl,
      confidence: result.confidence,
      reason: result.reason
    });

  } catch (err) {
    console.error('Error in rediscoverFeedRss:', err);
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
  rediscoverFeedRss
}