import db from '../models/index.js';
const { Feed, Category, Article, User } = db;

import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { generateOpml } from './opml.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';

/**
 * Google Reader API compatible implementation
 * Based on: https://github.com/FreshRSS/FreshRSS/blob/edge/p/api/greader.php
 * 
 * Documentation:
 * - https://code.google.com/archive/p/pyrfeed/wikis/GoogleReaderAPI.wiki
 * - https://web.archive.org/web/20130718025427/http://undoc.in/
 * - http://ranchero.com/downloads/GoogleReaderAPI-2009.pdf
 * - https://github.com/mihaip/google-reader-api
 * - https://web.archive.org/web/20210126113527/https://blog.martindoms.com/2009/08/15/using-the-google-reader-api-part-1
 * - https://github.com/noinnion/newsplus/blob/master/extensions/GoogleReaderCloneExtension/src/com/noinnion/android/newsplus/extension/google_reader/GoogleReaderClient.java
 * - https://github.com/ericmann/gReader-Library/blob/master/greader.class.php
 * - https://github.com/devongovett/reader
 * - https://github.com/theoldreader/api
 * - https://feedhq.readthedocs.io/en/latest/api/index.html
 * - https://github.com/bazqux/bazqux-api
 */

// Helper to generate auth token
const generateAuthToken = (user) => {
  const salt = process.env.GREADER_SALT || 'rssmonster-greader-salt';
  return crypto.createHash('sha1').update(salt + user.username + user.hash).digest('hex');
};

// Helper to generate action token (57 chars as per spec)
const generateActionToken = (user) => {
  const authToken = generateAuthToken(user);
  return authToken.padEnd(57, 'Z');
};

// Helper to validate auth header and return user
const validateAuth = async (req) => {
  const authHeader = req.headers.authorization || '';
  
  // Parse GoogleLogin auth header: "GoogleLogin auth=username/token"
  let auth = '';
  if (authHeader.startsWith('GoogleLogin auth=')) {
    auth = authHeader.substring(17);
  } else if (authHeader.startsWith('GoogleLogin_auth=')) {
    auth = authHeader.substring(17);
  }
  
  if (!auth) {
    return null;
  }
  
  const parts = auth.split('/');
  if (parts.length !== 2) {
    return null;
  }
  
  const [username, token] = parts;
  
  const user = await User.findOne({ where: { username } });
  if (!user) {
    return null;
  }
  
  const expectedToken = generateAuthToken(user);
  if (token !== expectedToken) {
    return null;
  }
  
  return user;
};

// Helper response methods
const badRequest = (res, message = 'Bad Request') => res.status(400).type('text/plain').send(message);

const unauthorized = (res) => res.status(401).type('text/plain').send('Unauthorized');

const notImplemented = (res) => res.status(501).type('text/plain').send('Not implemented');

const LABEL_PREFIX = 'user/-/label/';
const READING_LIST_STREAM = 'user/-/state/com.google/reading-list';
const READ_STREAM = 'user/-/state/com.google/read';
const STARRED_STREAM = 'user/-/state/com.google/starred';
const FALLBACK_CATEGORY_NAME = 'Uncategorized';

const safeDecodeURIComponent = (value = '') => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const encodeLabelName = (name = '') => encodeURIComponent(name);

const decodeLabelStream = (streamId = '') => {
  if (!streamId.startsWith(LABEL_PREFIX)) {
    return null;
  }
  return safeDecodeURIComponent(streamId.substring(LABEL_PREFIX.length));
};

const normalizeStreamPath = (streamPath) => {
  if (Array.isArray(streamPath)) {
    return streamPath.join('/');
  }
  return streamPath || '';
};

const stripFeedPrefix = (streamId = '') => {
  const value = String(streamId);
  return value.startsWith('feed/') ? value.substring(5) : value;
};

const decodeFeedRef = (streamId = '') => safeDecodeURIComponent(stripFeedPrefix(streamId));
const feedStreamId = (feed) => `feed/${encodeURIComponent(feed.url)}`;

const isIntegerString = (value) => /^\d+$/.test(String(value));

const findFeedByStreamId = async (streamId, userId) => {
  const feedRef = decodeFeedRef(streamId);
  if (!feedRef) {
    return null;
  }

  const where = isIntegerString(feedRef)
    ? { id: Number(feedRef), userId }
    : { url: feedRef, userId };

  return Feed.findOne({ where });
};

const findOrCreateCategoryByName = async (name, userId) => {
  const categoryName = safeDecodeURIComponent(name || FALLBACK_CATEGORY_NAME);
  const [category] = await Category.findOrCreate({
    where: { name: categoryName, userId },
    defaults: { name: categoryName, userId }
  });
  return category;
};

const getFallbackCategory = async (userId, excludeCategoryId = null) => {
  const existing = await Category.findOne({
    where: {
      userId,
      ...(excludeCategoryId ? { id: { [Op.ne]: excludeCategoryId } } : {})
    },
    order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
  });

  if (existing) {
    return existing;
  }

  return Category.create({
    name: FALLBACK_CATEGORY_NAME,
    userId,
    categoryOrder: 0
  });
};

const getArticleContent = (article) =>
  article.contentHtml ||
  article.description ||
  '';

const getArticleReaderTime = (article) =>
  article.firstSeen || article.createdAt || article.publishedAt || new Date(0);

const toUsecString = (date) => String(new Date(date).getTime() * 1000);

const toItemId = (id) => `tag:google.com,2005:reader/item/${Number(id).toString(16).padStart(16, '0')}`;

const parseItemId = (id) => {
  if (typeof id === 'string' && !id.match(/^\d+$/)) {
    return parseInt(id.replace('tag:google.com,2005:reader/item/', ''), 16);
  }
  return parseInt(id);
};

const parseReaderTimestamp = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  // Google Reader mutation timestamps are usually microseconds. Accept seconds
  // and milliseconds too; several clients are loose here.
  if (parsed > 1e14) return new Date(parsed / 1000);
  if (parsed > 1e11) return new Date(parsed);
  return new Date(parsed * 1000);
};

const createContinuation = (article) =>
  `${new Date(article.publishedAt).getTime()}:${article.id}`;

const applyContinuationFilter = (where, continuation, order) => {
  if (!continuation) {
    return;
  }

  const [publishedMsRaw, idRaw] = String(continuation).split(':');
  const publishedMs = Number(publishedMsRaw);
  const id = Number(idRaw);

  if (Number.isFinite(publishedMs) && Number.isFinite(id)) {
    const publishedAt = new Date(publishedMs);
    where[Op.or] = order === 'o'
      ? [
          { publishedAt: { [Op.gt]: publishedAt } },
          { publishedAt, id: { [Op.gt]: id } }
        ]
      : [
          { publishedAt: { [Op.lt]: publishedAt } },
          { publishedAt, id: { [Op.lt]: id } }
        ];
    return;
  }

  const legacyId = Number(continuation);
  if (Number.isFinite(legacyId)) {
    where.id = order === 'o'
      ? { [Op.gt]: legacyId }
      : { [Op.lt]: legacyId };
  }
};

const serializeArticle = (article) => {
  const feed = article.feed;
  const category = feed?.category;
  const categories = [
    READING_LIST_STREAM,
    ...(article.status === 'read' ? [READ_STREAM] : []),
    ...(article.favoriteInd === 1 ? [STARRED_STREAM] : []),
    ...(category?.name ? [`${LABEL_PREFIX}${encodeLabelName(category.name)}`] : [])
  ];

  return {
    id: toItemId(article.id),
    crawlTimeMsec: String(getArticleReaderTime(article).getTime()),
    timestampUsec: toUsecString(article.publishedAt),
    published: Math.floor(new Date(article.publishedAt).getTime() / 1000),
    title: article.title || '',
    summary: {
      content: getArticleContent(article)
    },
    alternate: [{
      href: article.url || '',
      type: 'text/html'
    }],
    categories,
    origin: {
      streamId: feed ? feedStreamId(feed) : `feed/${article.feedId}`,
      title: feed?.feedName || '',
      htmlUrl: feed?.url || ''
    },
    author: article.author || ''
  };
};

const applyStreamFilter = async (where, streamId, userId) => {
  const normalized = normalizeStreamPath(streamId);

  if (!normalized || normalized === 'reading-list' || normalized === READING_LIST_STREAM) {
    return READING_LIST_STREAM;
  }

  if (normalized.startsWith('feed/')) {
    const feed = await findFeedByStreamId(normalized, userId);
    if (feed) {
      where.feedId = feed.id;
    } else {
      where.feedId = { [Op.in]: [] };
    }
    return feed ? feedStreamId(feed) : `feed/${encodeURIComponent(decodeFeedRef(normalized))}`;
  }

  if (normalized === STARRED_STREAM) {
    where.favoriteInd = 1;
    return STARRED_STREAM;
  }

  if (normalized === READ_STREAM) {
    where.status = 'read';
    return READ_STREAM;
  }

  const categoryName = decodeLabelStream(normalized);
  if (categoryName !== null) {
    const category = await Category.findOne({
      where: { name: categoryName, userId },
      include: [{ model: Feed, attributes: ['id'] }]
    });
    where.feedId = category?.feeds?.length
      ? { [Op.in]: category.feeds.map(f => f.id) }
      : { [Op.in]: [] };
    return `${LABEL_PREFIX}${encodeLabelName(categoryName)}`;
  }

  return READING_LIST_STREAM;
};

const applyTargetFilter = (where, target, include = true) => {
  if (!target) {
    return;
  }

  if (target === READ_STREAM) {
    where.status = include ? 'read' : 'unread';
  } else if (target === STARRED_STREAM) {
    where.favoriteInd = include ? 1 : { [Op.ne]: 1 };
  }
};

const articleInclude = [{
  model: Feed,
  attributes: ['id', 'feedName', 'url', 'categoryId'],
  include: [{
    model: Category,
    attributes: ['id', 'name']
  }]
}];

/**
 * POST /api/greader/accounts/ClientLogin
 * Client login - returns SID, LSID, and Auth tokens
 */
export const clientLogin = async (req, res) => {
  try {
    const email = req.body.Email || req.query.Email;
    const passwd = req.body.Passwd || req.query.Passwd;
    
    if (!email || !passwd) {
      return badRequest(res, 'Email and Passwd required');
    }
    
    const user = await User.findOne({ where: { username: email } });
    if (!user) {
      return unauthorized(res);
    }
    
    // Validate password using the hash (md5 of username:password)
    const expectedHash = crypto.createHash('md5').update(`${email}:${passwd}`).digest('hex');
    if (user.hash !== expectedHash) {
      return unauthorized(res);
    }
    
    const authToken = `${email}/${generateAuthToken(user)}`;
    
    res.type('text/plain').send(
      `SID=${authToken}\n` +
      `LSID=null\n` +
      `Auth=${authToken}\n`
    );
  } catch (err) {
    console.error('Error in clientLogin:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/token
 * Get action token for POST requests
 */
export const getToken = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const token = generateActionToken(user);
    res.type('text/plain').send(token + '\n');
  } catch (err) {
    console.error('Error in getToken:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/user-info
 * Get user information
 */
export const getUserInfo = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    res.json({
      userId: user.username,
      userName: user.username,
      userProfileId: user.username,
      userEmail: user.username
    });
  } catch (err) {
    console.error('Error in getUserInfo:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/tag/list
 * List all tags (categories in our case)
 */
export const getTagList = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const output = req.query.output;
    if (output !== 'json') {
      return notImplemented(res);
    }
    
    const tags = [
      { id: 'user/-/state/com.google/starred' },
      { id: 'user/-/state/com.google/reading-list' }
    ];
    
    const categories = await Category.findAll({
      where: { userId: user.id },
      order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
    });
    
    for (const cat of categories) {
      tags.push({
        id: `${LABEL_PREFIX}${encodeLabelName(cat.name)}`,
        type: 'folder'
      });
    }
    
    res.json({ tags });
  } catch (err) {
    console.error('Error in getTagList:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/subscription/list
 * List all subscriptions (feeds)
 */
export const getSubscriptionList = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const output = req.query.output;
    if (output !== 'json') {
      return notImplemented(res);
    }
    
    const feeds = await Feed.findAll({
      where: { userId: user.id },
      include: [{
        model: Category,
        required: false
      }],
      order: [['feedName', 'ASC'], ['id', 'ASC']]
    });
    
    const subscriptions = [];
    
    for (const feed of feeds) {
      const category = feed.category;
      subscriptions.push({
        id: feedStreamId(feed),
        title: feed.feedName || feed.url,
        categories: category ? [{
          id: `${LABEL_PREFIX}${encodeLabelName(category.name)}`,
          label: category.name
        }] : [],
        url: feed.url,
        htmlUrl: feed.url,
        iconUrl: feed.favicon || ''
      });
    }
    
    res.json({ subscriptions });
  } catch (err) {
    console.error('Error in getSubscriptionList:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/greader/reader/api/0/subscription/edit
 * Edit subscription: subscribe, unsubscribe, edit (move/rename)
 */
export const editSubscription = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const streamId = req.body.s || req.query.s;
    const action = req.body.ac || req.query.ac;
    const title = req.body.t || req.query.t;
    const addCategory = req.body.a || req.query.a;
    const removeCategory = req.body.r || req.query.r;
    
    if (!streamId || !action) {
      return badRequest(res, 'Missing required parameters');
    }
    
    switch (action) {
      case 'subscribe': {
        // Extract URL from feed/URL format
        const feedUrl = decodeFeedRef(streamId);
        
        // Find or create category
        let categoryId = null;
        if (addCategory && addCategory.startsWith(LABEL_PREFIX)) {
          const categoryName = decodeLabelStream(addCategory);
          const category = await findOrCreateCategoryByName(categoryName, user.id);
          categoryId = category.id;
        } else {
          // Use first category as default
          const defaultCat = await Category.findOne({
            where: { userId: user.id },
            order: [['categoryOrder', 'ASC']]
          });
          categoryId = defaultCat?.id;
        }
        
        if (!categoryId) {
          return badRequest(res, 'No category available');
        }
        
        // Check if feed already exists
        const existingFeed = await Feed.findOne({
          where: { url: feedUrl, userId: user.id }
        });
        
        if (existingFeed) {
          return res.type('text/plain').send('OK');
        }
        
        // Create new feed
        await Feed.create({
          url: feedUrl,
          feedName: title || feedUrl,
          categoryId: categoryId,
          userId: user.id
        });
        
        return res.type('text/plain').send('OK');
      }
      
      case 'unsubscribe': {
        const feed = await findFeedByStreamId(streamId, user.id);
        if (feed) {
          await feed.destroy();
        }
        
        return res.type('text/plain').send('OK');
      }
      
      case 'edit': {
        const feed = await findFeedByStreamId(streamId, user.id);
        
        if (!feed) {
          return badRequest(res, 'Feed not found');
        }
        
        // Update title if provided
        if (title) {
          feed.feedName = title;
        }
        
        // Move to new category if provided
        if (addCategory && addCategory.startsWith(LABEL_PREFIX)) {
          const categoryName = decodeLabelStream(addCategory);
          const category = await findOrCreateCategoryByName(categoryName, user.id);
          feed.categoryId = category.id;
        } else if (removeCategory && removeCategory.startsWith(LABEL_PREFIX)) {
          const fallbackCategory = await getFallbackCategory(user.id, feed.categoryId);
          feed.categoryId = fallbackCategory.id;
        }
        
        await feed.save();
        return res.type('text/plain').send('OK');
      }
      
      default:
        return badRequest(res, 'Invalid action');
    }
  } catch (err) {
    console.error('Error in editSubscription:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/greader/reader/api/0/subscription/quickadd
 * Quick add a subscription
 */
export const quickAddSubscription = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    let feedUrl = req.body.quickadd || req.query.quickadd;
    if (!feedUrl) {
      return badRequest(res, 'Missing quickadd parameter');
    }
    
    feedUrl = decodeFeedRef(feedUrl);
    
    // Get first category as default
    const defaultCat = await Category.findOne({
      where: { userId: user.id },
      order: [['categoryOrder', 'ASC']]
    });
    
    if (!defaultCat) {
      return badRequest(res, 'No category available');
    }
    
    // Check if feed already exists
    const existingFeed = await Feed.findOne({
      where: { url: feedUrl, userId: user.id }
    });
    
    if (existingFeed) {
      return res.json({
        query: feedUrl,
        numResults: 1,
        streamId: feedStreamId(existingFeed),
        streamUrl: feedStreamId(existingFeed)
      });
    }
    
    // Create new feed
    const newFeed = await Feed.create({
      url: feedUrl,
      feedName: feedUrl,
      categoryId: defaultCat.id,
      userId: user.id
    });
    
    res.json({
      query: feedUrl,
      numResults: 1,
      streamId: feedStreamId(newFeed),
      streamUrl: feedStreamId(newFeed)
    });
  } catch (err) {
    console.error('Error in quickAddSubscription:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/unread-count
 * Get unread counts for all feeds and categories
 */
export const getUnreadCount = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const output = req.query.output;
    if (output !== 'json') {
      return notImplemented(res);
    }
    
    const unreadcounts = [];
    let totalLastUpdate = 0;
    const categoryCounts = new Map();
    
    const categories = await Category.findAll({
      where: { userId: user.id },
      order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
    });

    categories.forEach(category => {
      categoryCounts.set(category.id, {
        id: `${LABEL_PREFIX}${encodeLabelName(category.name)}`,
        count: 0,
        newestItemTimestampUsec: 0
      });
    });

    const feeds = await Feed.findAll({
      where: { userId: user.id },
      order: [['feedName', 'ASC'], ['id', 'ASC']]
    });
    
    for (const feed of feeds) {
      // Count unread articles for this feed.
      const unreadCount = await Article.count({
        where: {
          feedId: feed.id,
          status: 'unread',
          userId: user.id,
          ...canonicalArticleWhere()
        }
      });
      
      // Get newest item timestamp.
      const newestArticle = await Article.findOne({
        where: { feedId: feed.id, userId: user.id, ...canonicalArticleWhere() },
        order: [['createdAt', 'DESC']],
        attributes: ['createdAt', 'firstSeen', 'publishedAt']
      });
      
      const lastUpdate = newestArticle ? getArticleReaderTime(newestArticle).getTime() * 1000 : 0;
      
      unreadcounts.push({
        id: feedStreamId(feed),
        count: unreadCount,
        newestItemTimestampUsec: String(lastUpdate)
      });

      const categoryCount = categoryCounts.get(feed.categoryId);
      if (categoryCount) {
        categoryCount.count += unreadCount;
        if (lastUpdate > categoryCount.newestItemTimestampUsec) {
          categoryCount.newestItemTimestampUsec = lastUpdate;
        }
      }

      if (lastUpdate > totalLastUpdate) {
        totalLastUpdate = lastUpdate;
      }
    }

    categoryCounts.forEach(categoryCount => {
      unreadcounts.push({
        id: categoryCount.id,
        count: categoryCount.count,
        newestItemTimestampUsec: String(categoryCount.newestItemTimestampUsec)
      });
    });

    const totalUnreads = await Article.count({
      where: {
        status: 'unread',
        userId: user.id,
        ...canonicalArticleWhere()
      }
    });
    
    // Add reading-list total.
    unreadcounts.push({
      id: 'user/-/state/com.google/reading-list',
      count: totalUnreads,
      newestItemTimestampUsec: String(totalLastUpdate)
    });
    
    res.json({
      max: totalUnreads,
      unreadcounts
    });
  } catch (err) {
    console.error('Error in getUnreadCount:', err);
    return res.status(500).json({ error: err.message });
  }
};


/**
 * GET /api/greader/reader/api/0/stream/contents/*
 * Get stream contents (articles)
 */
export const getStreamContents = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    // Parse stream ID from path (supports both named param and legacy)
    const streamPath = normalizeStreamPath(req.params.streamPath || req.params[0] || '');
    const excludeTarget = req.query.xt || '';
    const filterTarget = req.query.it || '';
    const count = parseInt(req.query.n) || 20;
    const order = req.query.r || 'd'; // d = descending, o = ascending
    const startTime = parseReaderTimestamp(req.query.ot);
    const stopTime = parseReaderTimestamp(req.query.nt);
    const continuation = req.query.c || '';
    
    // Build query conditions
    const where = { userId: user.id, ...canonicalArticleWhere() };
    const streamId = await applyStreamFilter(where, streamPath, user.id);
    applyTargetFilter(where, excludeTarget, false);
    applyTargetFilter(where, filterTarget, true);
    
    // Time range filters
    if (startTime) {
      where.createdAt = { ...where.createdAt, [Op.gte]: startTime };
    }
    if (stopTime) {
      where.createdAt = { ...where.createdAt, [Op.lte]: stopTime };
    }
    
    // Continuation (pagination)
    applyContinuationFilter(where, continuation, order);
    
    const articles = await Article.findAll({
      where,
      include: articleInclude,
      order: [
        ['publishedAt', order === 'o' ? 'ASC' : 'DESC'],
        ['id', order === 'o' ? 'ASC' : 'DESC']
      ],
      limit: count + 1 // Fetch one extra to check for continuation
    });
    
    const hasMore = articles.length > count;
    const pageArticles = articles.slice(0, count);
    const items = pageArticles.map(serializeArticle);
    
    const response = {
      id: streamId,
      updated: Math.floor(Date.now() / 1000),
      items
    };
    
    if (hasMore && pageArticles.length > 0) {
      response.continuation = createContinuation(pageArticles[pageArticles.length - 1]);
    }
    
    res.json(response);
  } catch (err) {
    console.error('Error in getStreamContents:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/stream/items/ids
 * Get article IDs
 */
export const getStreamItemIds = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const streamId = req.query.s || '';
    const excludeTarget = req.query.xt || '';
    const filterTarget = req.query.it || '';
    const count = parseInt(req.query.n) || 20;
    const order = req.query.r || 'd';
    const startTime = parseReaderTimestamp(req.query.ot);
    const stopTime = parseReaderTimestamp(req.query.nt);
    const continuation = req.query.c || '';
    
    const where = { userId: user.id, ...canonicalArticleWhere() };
    await applyStreamFilter(where, streamId, user.id);
    applyTargetFilter(where, excludeTarget, false);
    applyTargetFilter(where, filterTarget, true);
    
    // Time range filters
    if (startTime) {
      where.createdAt = { ...where.createdAt, [Op.gte]: startTime };
    }
    if (stopTime) {
      where.createdAt = { ...where.createdAt, [Op.lte]: stopTime };
    }
    
    // Continuation
    applyContinuationFilter(where, continuation, order);
    
    const articles = await Article.findAll({
      where,
      attributes: ['id', 'publishedAt'],
      order: [
        ['publishedAt', order === 'o' ? 'ASC' : 'DESC'],
        ['id', order === 'o' ? 'ASC' : 'DESC']
      ],
      limit: count + 1
    });
    
    const hasMore = articles.length > count;
    const pageArticles = articles.slice(0, count);
    const itemRefs = pageArticles.map(article => ({
      id: String(article.id)
    }));
    
    const response = { itemRefs };
    
    if (hasMore && pageArticles.length > 0) {
      response.continuation = createContinuation(pageArticles[pageArticles.length - 1]);
    }
    
    res.json(response);
  } catch (err) {
    console.error('Error in getStreamItemIds:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/greader/reader/api/0/stream/items/contents
 * Get article contents by IDs
 */
export const getStreamItemContents = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    // Item IDs can be passed as array or multiple 'i' parameters
    let itemIds = req.body.i || req.query.i || [];
    if (!Array.isArray(itemIds)) {
      itemIds = [itemIds];
    }
    
    const numericIds = itemIds.map(parseItemId).filter(id => !isNaN(id));
    
    if (numericIds.length === 0) {
      return res.json({ items: [] });
    }
    
    const articles = await Article.findAll({
      where: {
        id: { [Op.in]: numericIds },
        userId: user.id,
        ...canonicalArticleWhere()
      },
      include: articleInclude
    });
    
    const idIndexMap = new Map(numericIds.map((id, index) => [String(id), index]));
    articles.sort((a, b) => idIndexMap.get(String(a.id)) - idIndexMap.get(String(b.id)));
    const items = articles.map(serializeArticle);
    
    res.json({
      id: 'user/-/state/com.google/reading-list',
      updated: Math.floor(Date.now() / 1000),
      items
    });
  } catch (err) {
    console.error('Error in getStreamItemContents:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/greader/reader/api/0/edit-tag
 * Edit tags on articles (mark read/unread/starred)
 */
export const editTag = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    // Get item IDs
    let itemIds = req.body.i || req.query.i || [];
    if (!Array.isArray(itemIds)) {
      itemIds = [itemIds];
    }
    
    // Get tags to add/remove
    let addTags = req.body.a || req.query.a || [];
    let removeTags = req.body.r || req.query.r || [];
    if (!Array.isArray(addTags)) addTags = [addTags];
    if (!Array.isArray(removeTags)) removeTags = [removeTags];
    
    const numericIds = itemIds.map(parseItemId).filter(id => !isNaN(id));
    
    if (numericIds.length === 0) {
      return res.type('text/plain').send('OK');
    }
    
    // Process add tags
    for (const tag of addTags) {
      if (tag === 'user/-/state/com.google/read') {
        await Article.update(
          { status: 'read' },
          { where: { id: { [Op.in]: numericIds }, userId: user.id, ...canonicalArticleWhere() } }
        );
      } else if (tag === 'user/-/state/com.google/starred') {
        await Article.update(
          { favoriteInd: 1 },
          { where: { id: { [Op.in]: numericIds }, userId: user.id, ...canonicalArticleWhere() } }
        );
      }
    }
    
    // Process remove tags
    for (const tag of removeTags) {
      if (tag === 'user/-/state/com.google/read') {
        await Article.update(
          { status: 'unread' },
          { where: { id: { [Op.in]: numericIds }, userId: user.id, ...canonicalArticleWhere() } }
        );
      } else if (tag === 'user/-/state/com.google/starred') {
        await Article.update(
          { favoriteInd: 0 },
          { where: { id: { [Op.in]: numericIds }, userId: user.id, ...canonicalArticleWhere() } }
        );
      }
    }
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in editTag:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/greader/reader/api/0/mark-all-as-read
 * Mark all articles as read in a stream
 */
export const markAllAsRead = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const streamId = req.body.s || req.query.s || READING_LIST_STREAM;
    const timestamp = req.body.ts || req.query.ts || '0';
    
    const olderThan = parseReaderTimestamp(timestamp) || new Date();
    
    const where = { userId: user.id, ...canonicalArticleWhere(), publishedAt: { [Op.lte]: olderThan } };
    await applyStreamFilter(where, streamId, user.id);
    
    await Article.update(
      { status: 'read' },
      { where }
    );
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in markAllAsRead:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/greader/reader/api/0/rename-tag
 * Rename a category/tag
 */
export const renameTag = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const source = req.body.s || req.query.s || '';
    const dest = req.body.dest || req.query.dest || '';
    
    if (!source.startsWith(LABEL_PREFIX) || !dest.startsWith(LABEL_PREFIX)) {
      return badRequest(res, 'Invalid tag format');
    }
    
    const sourceName = decodeLabelStream(source);
    const destName = decodeLabelStream(dest);
    
    const category = await Category.findOne({
      where: { name: sourceName, userId: user.id }
    });
    
    if (!category) {
      return badRequest(res, 'Category not found');
    }
    
    category.name = destName;
    await category.save();
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in renameTag:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/greader/reader/api/0/disable-tag
 * Delete a category/tag
 */
export const disableTag = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const source = req.body.s || req.query.s || '';
    
    if (!source.startsWith(LABEL_PREFIX)) {
      return badRequest(res, 'Invalid tag format');
    }
    
    const sourceName = decodeLabelStream(source);
    const category = await Category.findOne({
      where: { name: sourceName, userId: user.id }
    });

    if (category) {
      const fallbackCategory = await getFallbackCategory(user.id, category.id);

      await Feed.update(
        { categoryId: fallbackCategory.id },
        { where: { categoryId: category.id, userId: user.id } }
      );

      await category.destroy();
    }
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in disableTag:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/subscription/export
 * Export subscriptions as OPML
 */
export const exportSubscriptions = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    const opml = await generateOpml(user.id);
    
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="subscriptions.opml"`);
    res.send(opml);
  } catch (err) {
    console.error('Error in exportSubscriptions:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET/POST /api/greader/check/compatibility
 * Check API compatibility
 */
export const checkCompatibility = (req, res) => {
  res.type('text/plain').send('OK');
};

export default {
  clientLogin,
  getToken,
  getUserInfo,
  getTagList,
  getSubscriptionList,
  editSubscription,
  quickAddSubscription,
  getUnreadCount,
  getStreamContents,
  getStreamItemIds,
  getStreamItemContents,
  editTag,
  markAllAsRead,
  renameTag,
  disableTag,
  exportSubscriptions,
  checkCompatibility
};
