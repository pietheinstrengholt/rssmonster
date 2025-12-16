import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Category from "../models/category.js";
import User from "../models/user.js";
import crypto from 'node:crypto';
import { Op } from 'sequelize';

/**
 * Google Reader API compatible implementation
 * Based on: https://github.com/FreshRSS/FreshRSS/blob/edge/p/api/greader.php
 * 
 * Documentation:
 * - https://github.com/mihaip/google-reader-api
 * - https://web.archive.org/web/20130718025427/http://undoc.in/
 * - https://ranchero.com/downloads/GoogleReaderAPI-2009.pdf
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
const badRequest = (res, message = 'Bad Request') => {
  return res.status(400).type('text/plain').send(message);
};

const unauthorized = (res) => {
  return res.status(401).type('text/plain').send('Unauthorized');
};

const notImplemented = (res) => {
  return res.status(501).type('text/plain').send('Not implemented');
};

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
        id: `user/-/label/${cat.name}`,
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
    
    const categories = await Category.findAll({
      where: { userId: user.id },
      include: [{
        model: Feed,
        required: false
      }],
      order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
    });
    
    const subscriptions = [];
    
    for (const cat of categories) {
      if (cat.feeds) {
        for (const feed of cat.feeds) {
          subscriptions.push({
            id: `feed/${feed.id}`,
            title: feed.feedName || feed.url,
            categories: [{
              id: `user/-/label/${cat.name}`,
              label: cat.name
            }],
            url: feed.url,
            htmlUrl: feed.link || feed.url,
            iconUrl: feed.favicon || ''
          });
        }
      }
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
        let feedUrl = streamId;
        if (feedUrl.startsWith('feed/')) {
          feedUrl = feedUrl.substring(5);
        }
        
        // Find or create category
        let categoryId = null;
        if (addCategory && addCategory.startsWith('user/-/label/')) {
          const categoryName = addCategory.substring(13);
          let category = await Category.findOne({
            where: { name: categoryName, userId: user.id }
          });
          if (!category) {
            category = await Category.create({
              name: categoryName,
              userId: user.id
            });
          }
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
        // Extract feed ID
        let feedId = streamId;
        if (feedId.startsWith('feed/')) {
          feedId = feedId.substring(5);
        }
        
        if (isNaN(parseInt(feedId))) {
          // It's a URL, find by URL
          await Feed.destroy({
            where: { url: feedId, userId: user.id }
          });
        } else {
          await Feed.destroy({
            where: { id: parseInt(feedId), userId: user.id }
          });
        }
        
        return res.type('text/plain').send('OK');
      }
      
      case 'edit': {
        // Extract feed ID
        let feedId = streamId;
        if (feedId.startsWith('feed/')) {
          feedId = feedId.substring(5);
        }
        
        const feed = await Feed.findOne({
          where: { id: parseInt(feedId), userId: user.id }
        });
        
        if (!feed) {
          return badRequest(res, 'Feed not found');
        }
        
        // Update title if provided
        if (title) {
          feed.feedName = title;
        }
        
        // Move to new category if provided
        if (addCategory && addCategory.startsWith('user/-/label/')) {
          const categoryName = addCategory.substring(13);
          let category = await Category.findOne({
            where: { name: categoryName, userId: user.id }
          });
          if (!category) {
            category = await Category.create({
              name: categoryName,
              userId: user.id
            });
          }
          feed.categoryId = category.id;
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
    
    if (feedUrl.startsWith('feed/')) {
      feedUrl = feedUrl.substring(5);
    }
    
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
        streamId: `feed/${existingFeed.id}`
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
      streamId: `feed/${newFeed.id}`
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
    let totalUnreads = 0;
    let totalLastUpdate = 0;
    
    const categories = await Category.findAll({
      where: { userId: user.id },
      include: [{
        model: Feed,
        required: false
      }],
      order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
    });
    
    for (const cat of categories) {
      let catUnreadCount = 0;
      let catLastUpdate = 0;
      
      if (cat.feeds) {
        for (const feed of cat.feeds) {
          // Count unread articles for this feed
          const unreadCount = await Article.count({
            where: {
              feedId: feed.id,
              status: 'unread',
              userId: user.id
            }
          });
          
          // Get newest item timestamp
          const newestArticle = await Article.findOne({
            where: { feedId: feed.id, userId: user.id },
            order: [['published', 'DESC']],
            attributes: ['published']
          });
          
          const lastUpdate = newestArticle ? newestArticle.published.getTime() * 1000 : 0;
          
          unreadcounts.push({
            id: `feed/${feed.id}`,
            count: unreadCount,
            newestItemTimestampUsec: String(lastUpdate)
          });
          
          catUnreadCount += unreadCount;
          if (lastUpdate > catLastUpdate) {
            catLastUpdate = lastUpdate;
          }
        }
      }
      
      unreadcounts.push({
        id: `user/-/label/${cat.name}`,
        count: catUnreadCount,
        newestItemTimestampUsec: String(catLastUpdate)
      });
      
      totalUnreads += catUnreadCount;
      if (catLastUpdate > totalLastUpdate) {
        totalLastUpdate = catLastUpdate;
      }
    }
    
    // Add reading-list total
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
    const streamPath = req.params.streamPath || req.params[0] || '';
    const excludeTarget = req.query.xt || '';
    const filterTarget = req.query.it || '';
    const count = parseInt(req.query.n) || 20;
    const order = req.query.r || 'd'; // d = descending, o = ascending
    const startTime = parseInt(req.query.ot) || 0;
    const stopTime = parseInt(req.query.nt) || 0;
    const continuation = req.query.c || '';
    
    // Build query conditions
    const where = { userId: user.id };
    let streamId = 'reading-list';
    
    // Parse stream path
    if (streamPath.startsWith('feed/')) {
      const feedId = streamPath.substring(5);
      if (!isNaN(parseInt(feedId))) {
        where.feedId = parseInt(feedId);
        streamId = streamPath;
      }
    } else if (streamPath.startsWith('user/-/label/') || streamPath.startsWith('user/-/state/com.google/')) {
      if (streamPath.includes('/label/')) {
        const categoryName = streamPath.split('/label/')[1];
        const category = await Category.findOne({
          where: { name: decodeURIComponent(categoryName), userId: user.id },
          include: [{ model: Feed, attributes: ['id'] }]
        });
        if (category && category.feeds) {
          where.feedId = { [Op.in]: category.feeds.map(f => f.id) };
        }
        streamId = streamPath;
      } else if (streamPath.includes('/starred')) {
        where.starInd = 1;
        streamId = 'user/-/state/com.google/starred';
      }
    } else if (streamPath === 'reading-list' || streamPath === '') {
      // All articles - no additional filter
      streamId = 'user/-/state/com.google/reading-list';
    }
    
    // Exclude read articles if requested
    if (excludeTarget === 'user/-/state/com.google/read') {
      where.status = 'unread';
    }
    
    // Filter by read articles if requested
    if (filterTarget === 'user/-/state/com.google/read') {
      where.status = 'read';
    }
    
    // Time range filters
    if (startTime > 0) {
      where.published = { ...where.published, [Op.gte]: new Date(startTime * 1000) };
    }
    if (stopTime > 0) {
      where.published = { ...where.published, [Op.lte]: new Date(stopTime * 1000) };
    }
    
    // Continuation (pagination)
    if (continuation && !isNaN(parseInt(continuation))) {
      if (order === 'o') {
        where.id = { [Op.gt]: parseInt(continuation) };
      } else {
        where.id = { [Op.lt]: parseInt(continuation) };
      }
    }
    
    const articles = await Article.findAll({
      where,
      include: [{
        model: Feed,
        attributes: ['id', 'feedName', 'url']
      }],
      order: [['published', order === 'o' ? 'ASC' : 'DESC']],
      limit: count + 1 // Fetch one extra to check for continuation
    });
    
    const hasMore = articles.length > count;
    const items = articles.slice(0, count).map(article => ({
      id: `tag:google.com,2005:reader/item/${article.id.toString(16).padStart(16, '0')}`,
      crawlTimeMsec: String(article.createdAt.getTime()),
      timestampUsec: String(article.published.getTime() * 1000),
      published: Math.floor(article.published.getTime() / 1000),
      title: article.title || '',
      summary: {
        content: article.content || ''
      },
      alternate: [{
        href: article.url || '',
        type: 'text/html'
      }],
      categories: [
        'user/-/state/com.google/reading-list',
        ...(article.status === 'read' ? ['user/-/state/com.google/read'] : []),
        ...(article.starInd === 1 ? ['user/-/state/com.google/starred'] : [])
      ],
      origin: {
        streamId: `feed/${article.feedId}`,
        title: article.feed?.feedName || '',
        htmlUrl: article.feed?.url || ''
      },
      author: article.author || ''
    }));
    
    const response = {
      id: streamId,
      updated: Math.floor(Date.now() / 1000),
      items
    };
    
    if (hasMore && articles.length > 0) {
      response.continuation = String(articles[count - 1].id);
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
    const count = parseInt(req.query.n) || 20;
    const order = req.query.r || 'd';
    const startTime = parseInt(req.query.ot) || 0;
    const stopTime = parseInt(req.query.nt) || 0;
    const continuation = req.query.c || '';
    
    const where = { userId: user.id };
    
    // Parse stream ID
    if (streamId.startsWith('feed/')) {
      const feedId = streamId.substring(5);
      if (!isNaN(parseInt(feedId))) {
        where.feedId = parseInt(feedId);
      }
    } else if (streamId === 'user/-/state/com.google/starred') {
      where.starInd = 1;
    } else if (streamId.startsWith('user/-/label/')) {
      const categoryName = streamId.substring(13);
      const category = await Category.findOne({
        where: { name: decodeURIComponent(categoryName), userId: user.id },
        include: [{ model: Feed, attributes: ['id'] }]
      });
      if (category && category.feeds) {
        where.feedId = { [Op.in]: category.feeds.map(f => f.id) };
      }
    }
    
    // Exclude read articles if requested
    if (excludeTarget === 'user/-/state/com.google/read') {
      where.status = 'unread';
    }
    
    // Time range filters
    if (startTime > 0) {
      where.published = { ...where.published, [Op.gte]: new Date(startTime * 1000) };
    }
    if (stopTime > 0) {
      where.published = { ...where.published, [Op.lte]: new Date(stopTime * 1000) };
    }
    
    // Continuation
    if (continuation && !isNaN(parseInt(continuation))) {
      if (order === 'o') {
        where.id = { [Op.gt]: parseInt(continuation) };
      } else {
        where.id = { [Op.lt]: parseInt(continuation) };
      }
    }
    
    const articles = await Article.findAll({
      where,
      attributes: ['id'],
      order: [['published', order === 'o' ? 'ASC' : 'DESC']],
      limit: count + 1
    });
    
    const hasMore = articles.length > count;
    const itemRefs = articles.slice(0, count).map(article => ({
      id: String(article.id)
    }));
    
    const response = { itemRefs };
    
    if (hasMore && articles.length > 0) {
      response.continuation = String(articles[count - 1].id);
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
    
    // Convert hex IDs to decimal if needed
    const numericIds = itemIds.map(id => {
      if (typeof id === 'string' && !id.match(/^\d+$/)) {
        // Strip tag:google.com,2005:reader/item/ prefix if present
        id = id.replace('tag:google.com,2005:reader/item/', '');
        // Convert from hex
        return parseInt(id, 16);
      }
      return parseInt(id);
    }).filter(id => !isNaN(id));
    
    if (numericIds.length === 0) {
      return res.json({ items: [] });
    }
    
    const articles = await Article.findAll({
      where: {
        id: { [Op.in]: numericIds },
        userId: user.id
      },
      include: [{
        model: Feed,
        attributes: ['id', 'feedName', 'url']
      }]
    });
    
    const items = articles.map(article => ({
      id: `tag:google.com,2005:reader/item/${article.id.toString(16).padStart(16, '0')}`,
      crawlTimeMsec: String(article.createdAt.getTime()),
      timestampUsec: String(article.published.getTime() * 1000),
      published: Math.floor(article.published.getTime() / 1000),
      title: article.title || '',
      summary: {
        content: article.content || ''
      },
      alternate: [{
        href: article.url || '',
        type: 'text/html'
      }],
      categories: [
        'user/-/state/com.google/reading-list',
        ...(article.status === 'read' ? ['user/-/state/com.google/read'] : []),
        ...(article.starInd === 1 ? ['user/-/state/com.google/starred'] : [])
      ],
      origin: {
        streamId: `feed/${article.feedId}`,
        title: article.feed?.feedName || '',
        htmlUrl: article.feed?.url || ''
      },
      author: article.author || ''
    }));
    
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
    let itemIds = req.body.i || [];
    if (!Array.isArray(itemIds)) {
      itemIds = [itemIds];
    }
    
    // Get tags to add/remove
    let addTags = req.body.a || [];
    let removeTags = req.body.r || [];
    if (!Array.isArray(addTags)) addTags = [addTags];
    if (!Array.isArray(removeTags)) removeTags = [removeTags];
    
    // Convert hex IDs to decimal
    const numericIds = itemIds.map(id => {
      if (typeof id === 'string' && !id.match(/^\d+$/)) {
        id = id.replace('tag:google.com,2005:reader/item/', '');
        return parseInt(id, 16);
      }
      return parseInt(id);
    }).filter(id => !isNaN(id));
    
    if (numericIds.length === 0) {
      return res.type('text/plain').send('OK');
    }
    
    // Process add tags
    for (const tag of addTags) {
      if (tag === 'user/-/state/com.google/read') {
        await Article.update(
          { status: 'read' },
          { where: { id: { [Op.in]: numericIds }, userId: user.id } }
        );
      } else if (tag === 'user/-/state/com.google/starred') {
        await Article.update(
          { starInd: 1 },
          { where: { id: { [Op.in]: numericIds }, userId: user.id } }
        );
      }
    }
    
    // Process remove tags
    for (const tag of removeTags) {
      if (tag === 'user/-/state/com.google/read') {
        await Article.update(
          { status: 'unread' },
          { where: { id: { [Op.in]: numericIds }, userId: user.id } }
        );
      } else if (tag === 'user/-/state/com.google/starred') {
        await Article.update(
          { starInd: 0 },
          { where: { id: { [Op.in]: numericIds }, userId: user.id } }
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
    
    const streamId = req.body.s || '';
    const timestamp = req.body.ts || '0';
    
    // Convert timestamp from nanoseconds to Date
    const olderThan = timestamp !== '0' 
      ? new Date(parseInt(timestamp) / 1000) 
      : new Date();
    
    const where = { userId: user.id, published: { [Op.lte]: olderThan } };
    
    if (streamId.startsWith('feed/')) {
      const feedId = parseInt(streamId.substring(5));
      if (!isNaN(feedId)) {
        where.feedId = feedId;
      }
    } else if (streamId.startsWith('user/-/label/')) {
      const categoryName = streamId.substring(13);
      const category = await Category.findOne({
        where: { name: decodeURIComponent(categoryName), userId: user.id },
        include: [{ model: Feed, attributes: ['id'] }]
      });
      if (category && category.feeds) {
        where.feedId = { [Op.in]: category.feeds.map(f => f.id) };
      }
    } else if (streamId === 'user/-/state/com.google/starred') {
      where.starInd = 1;
    }
    // For reading-list, mark all user's articles as read (no additional filter)
    
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
    
    const source = req.body.s || '';
    const dest = req.body.dest || '';
    
    if (!source.startsWith('user/-/label/') || !dest.startsWith('user/-/label/')) {
      return badRequest(res, 'Invalid tag format');
    }
    
    const sourceName = source.substring(13);
    const destName = dest.substring(13);
    
    const category = await Category.findOne({
      where: { name: decodeURIComponent(sourceName), userId: user.id }
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
    
    const source = req.body.s || '';
    
    if (!source.startsWith('user/-/label/')) {
      return badRequest(res, 'Invalid tag format');
    }
    
    const sourceName = source.substring(13);
    
    await Category.destroy({
      where: { name: decodeURIComponent(sourceName), userId: user.id }
    });
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in disableTag:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/greader/reader/api/0/subscription/export
 * Export subscriptions as OPML (placeholder - returns empty)
 */
export const exportSubscriptions = async (req, res) => {
  try {
    const user = await validateAuth(req);
    if (!user) {
      return unauthorized(res);
    }
    
    // TODO: Implement OPML export
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><opml version="1.0"><body></body></opml>');
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
