import db from '../models/index.js';
const { Feed, Category, Article, User, sequelize } = db;

import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { generateOpml } from './opml.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';
import {
  createGreaderActionToken,
  createGreaderAuthToken
} from '../utils/apiCredentials.js';
import { sendGreaderUnauthorized } from '../middleware/greaderAuth.js';
import {
  addFeedSubscription,
  disableFeedCategories,
  isFeedManagementError,
  removeFeedSubscription,
  renameFeedCategory,
  updateFeedSubscription
} from '../services/feeds/feedManagement.js';
import {
  OpmlImportError,
  importOpmlSubscriptions
} from '../services/feeds/opmlImport.js';
import {
  LABEL_PREFIX,
  READING_LIST_STREAM,
  READ_STREAM,
  STARRED_STREAM,
  MAX_STREAM_ITEM_ID_COUNT,
  GreaderStreamError,
  buildGreaderStreamScope,
  createStreamContinuation,
  parseReaderTimestamp,
  queryGreaderStream
} from '../services/greader/streamQuery.js';
import {
  getFirstGreaderParameterValue,
  getGreaderParameterValues,
  normalizeGreaderParameterValues
} from '../utils/greaderParameters.js';
import { serializeGreaderArticle } from '../services/greader/articleSerializer.js';
import {
  GreaderItemIdError,
  parseRequestedGreaderItemIds
} from '../services/greader/itemIds.js';
import { parseGreaderAuthorization } from '../middleware/greaderAuth.js';

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
const generateAuthToken = user => createGreaderAuthToken(user);

// Helper response methods
const badRequest = (res, message = 'Bad Request') => res.status(400).type('text/plain').send(message);

const notImplemented = (res) => res.status(501).type('text/plain').send('Not implemented');

const CLIENT_LOGIN_DUMMY_HASH =
  '$2b$10$AmwyD7rUaDtQhLRXysn6I./bi.ph3kXw.fo1gBVvvt/tiWTeVEW6a';

// This function returns a stable Reader error without exposing internal details.
const internalError = res =>
  res.status(500).type('text/plain').send('Internal Server Error');

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

// This function returns the first valid category label from one compatibility parameter.
const categoryNameFromParameter = value => {
  const values = normalizeGreaderParameterValues(value);
  const label = values.find(item =>
    typeof item === 'string' && item.startsWith(LABEL_PREFIX)
  );

  return label ? decodeLabelStream(label) : null;
};

const stripFeedPrefix = (streamId = '') => {
  let value = String(streamId);
  while (value.startsWith('feed/')) value = value.substring(5);
  return value;
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

// This function converts one Reader crawl timestamp into an exact microsecond string.
const readerTimestampUsec = value => {
  const milliseconds = value ? new Date(value).getTime() : 0;
  return Number.isFinite(milliseconds)
    ? String(BigInt(Math.trunc(milliseconds)) * 1000n)
    : '0';
};

// This function returns one repeated scalar parameter or rejects conflicting values.
const getMutationScalar = (req, name) => {
  const values = getGreaderParameterValues(req, name);
  if (values.length > 1 && new Set(values).size > 1) {
    throw new GreaderStreamError(`Conflicting ${name} parameters`);
  }
  return values[0] || '';
};

// This function builds user-scoped associations needed by item serialization.
const articleIncludeForUser = userId => [{
  model: Feed,
  attributes: ['id', 'feedName', 'url', 'categoryId'],
  required: true,
  where: { userId },
  include: [{
    model: Category,
    attributes: ['id', 'name'],
    required: false,
    where: { userId }
  }]
}];

/**
 * POST /api/greader/accounts/ClientLogin
 * Client login - returns SID, LSID, and Auth tokens
 */
export const clientLogin = async (req, res) => {
  try {
    const email = req.body?.Email || req.query.Email;
    const passwd = req.body?.Passwd || req.query.Passwd;

    if (!email || !passwd) {
      return badRequest(res, 'Email and Passwd required');
    }
    
    const user = await User.findOne({ where: { username: email } });

    // Validate the raw Google Reader password against the slow account hash.
    const passwordMatches = await bcrypt.compare(
      passwd,
      user?.password || CLIENT_LOGIN_DUMMY_HASH
    );
    if (!user || !passwordMatches) {
      return sendGreaderUnauthorized(res);
    }
    
    const authToken = `${email}/${generateAuthToken(user)}`;
    
    res.type('text/plain').send(
      `SID=${authToken}\n` +
      `LSID=null\n` +
      `Auth=${authToken}\n`
    );
  } catch (err) {
    console.error('Error in clientLogin:', err);
    return internalError(res);
  }
};

/**
 * GET /api/greader/reader/api/0/token
 * Get action token for POST requests
 */
export const getToken = async (req, res) => {
  try {
    const user = req.greaderUser;
    const token = createGreaderActionToken(user, req.greaderAuthToken);
    res.type('text/plain').send(token + '\n');
  } catch (err) {
    console.error('Error in getToken:', err);
    return internalError(res);
  }
};

/**
 * GET /api/greader/reader/api/0/user-info
 * Get user information
 */
export const getUserInfo = async (req, res) => {
  try {
    const user = req.greaderUser;
    
    res.json({
      userId: user.username,
      userName: user.username,
      userProfileId: user.username,
      userEmail: user.username
    });
  } catch (err) {
    console.error('Error in getUserInfo:', err);
    return internalError(res);
  }
};

/**
 * GET /api/greader/reader/api/0/tag/list
 * List all tags (categories in our case)
 */
export const getTagList = async (req, res) => {
  try {
    const user = req.greaderUser;
    
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
    return internalError(res);
  }
};

/**
 * GET /api/greader/reader/api/0/subscription/list
 * List all subscriptions (feeds)
 */
export const getSubscriptionList = async (req, res) => {
  try {
    const user = req.greaderUser;
    
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
        htmlUrl: '',
        iconUrl: feed.favicon || ''
      });
    }
    
    res.json({ subscriptions });
  } catch (err) {
    console.error('Error in getSubscriptionList:', err);
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/subscription/edit
 * Edit subscription: subscribe, unsubscribe, edit (move/rename)
 */
export const editSubscription = async (req, res) => {
  try {
    const user = req.greaderUser;
    const streamIds = getGreaderParameterValues(req, 's');
    const action = getMutationScalar(req, 'ac');
    const titles = getGreaderParameterValues(req, 't');
    const addCategory = getGreaderParameterValues(req, 'a');
    const removeCategory = getGreaderParameterValues(req, 'r');

    if (streamIds.length === 0 || !action) {
      return badRequest(res, 'Missing required parameters');
    }
    if (!['subscribe', 'unsubscribe', 'edit'].includes(action)) {
      return badRequest(res, 'Invalid action');
    }

    const categoryName = categoryNameFromParameter(addCategory);
    const removedCategoryName = categoryNameFromParameter(removeCategory);
    for (const [index, streamId] of streamIds.entries()) {
      const title = titles[index] || '';
      if (action === 'subscribe') {
        // Extract URL from feed/URL format
        await addFeedSubscription({
          userId: user.id,
          inputUrl: decodeFeedRef(streamId),
          categoryName,
          useDefaultCategory: !categoryName,
          title,
          allowExisting: true,
          updateExisting: true
        });
        continue;
      }

      const feed = await findFeedByStreamId(streamId, user.id);
      if (action === 'unsubscribe') {
        if (feed) {
          await removeFeedSubscription({
            userId: user.id,
            feedId: feed.id
          });
        }
        continue;
      }
      if (!feed) return badRequest(res, 'Feed not found');

      // Update title if provided
      // Move to new category if provided
      await updateFeedSubscription({
        userId: user.id,
        feedId: feed.id,
        updates: title ? { feedName: title } : {},
        categoryName,
        // Added category wins deterministically when both a and r are present.
        removeCategory: !categoryName && Boolean(removedCategoryName)
      });
    }

    return res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in editSubscription:', err);
    if (err instanceof GreaderStreamError) {
      return badRequest(res, err.message);
    }
    if (isFeedManagementError(err)) {
      return badRequest(res, 'Unable to update subscription');
    }
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/subscription/quickadd
 * Quick add a subscription
 */
export const quickAddSubscription = async (req, res) => {
  const query = getFirstGreaderParameterValue(req, 'quickadd');

  try {
    const user = req.greaderUser;
    
    if (!query) {
      return badRequest(res, 'Missing quickadd parameter');
    }

    const result = await addFeedSubscription({
      userId: user.id,
      inputUrl: decodeFeedRef(query),
      useDefaultCategory: true,
      allowExisting: true
    });
    const streamId = feedStreamId(result.feed);
    
    res.json({
      query: result.query,
      numResults: 1,
      streamId,
      streamName: result.feed.feedName,
      streamUrl: streamId
    });
  } catch (err) {
    console.error('Error in quickAddSubscription:', err);
    if (isFeedManagementError(err)) {
      return res.json({
        query: String(query || ''),
        numResults: 0,
        streamId: '',
        streamName: '',
        streamUrl: ''
      });
    }
    return internalError(res);
  }
};

/**
 * GET /api/greader/reader/api/0/unread-count
 * Get unread counts for all feeds and categories
 */
export const getUnreadCount = async (req, res) => {
  try {
    const user = req.greaderUser;
    
    const output = req.query.output;
    if (output !== 'json') {
      return notImplemented(res);
    }
    
    const [categories, feeds, feedAggregates] = await Promise.all([
      Category.findAll({
      where: { userId: user.id },
      attributes: ['id', 'name'],
      order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
      }),
      Feed.findAll({
        where: { userId: user.id },
        attributes: ['id', 'categoryId', 'feedName', 'url'],
        order: [['feedName', 'ASC'], ['id', 'ASC']]
      }),
      Article.findAll({
        attributes: [
          'feedId',
          [
            sequelize.literal(
              "SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END)"
            ),
            'unreadCount'
          ],
          [sequelize.fn('MAX', sequelize.col('createdAt')), 'newestCreatedAt']
        ],
        where: {
          userId: user.id,
          ...canonicalArticleWhere()
        },
        group: ['feedId'],
        raw: true
      })
    ]);
    const aggregateByFeed = new Map(feedAggregates.map(row => [
      Number(row.feedId),
      {
        count: Number(row.unreadCount),
        newestItemTimestampUsec: readerTimestampUsec(row.newestCreatedAt)
      }
    ]));
    const categoryCounts = new Map(categories.map(category => [
      Number(category.id),
      {
        id: `${LABEL_PREFIX}${encodeLabelName(category.name)}`,
        count: 0,
        newestItemTimestampUsec: '0'
      }
    ]));
    const unreadcounts = [];
    let totalUnreads = 0;
    let totalLastUpdate = 0n;

    for (const feed of feeds) {
      const aggregate = aggregateByFeed.get(Number(feed.id)) || {
        count: 0,
        newestItemTimestampUsec: '0'
      };

      unreadcounts.push({
        id: feedStreamId(feed),
        count: aggregate.count,
        newestItemTimestampUsec: aggregate.newestItemTimestampUsec
      });

      const categoryCount = categoryCounts.get(Number(feed.categoryId));
      if (categoryCount) {
        categoryCount.count += aggregate.count;
        if (
          BigInt(aggregate.newestItemTimestampUsec) >
          BigInt(categoryCount.newestItemTimestampUsec)
        ) {
          categoryCount.newestItemTimestampUsec =
            aggregate.newestItemTimestampUsec;
        }
      }
      totalUnreads += aggregate.count;
      totalLastUpdate = BigInt(aggregate.newestItemTimestampUsec) >
        totalLastUpdate
        ? BigInt(aggregate.newestItemTimestampUsec)
        : totalLastUpdate;
    }

    categoryCounts.forEach(categoryCount => {
      unreadcounts.push(categoryCount);
    });

    // Add reading-list total.
    unreadcounts.push({
      id: READING_LIST_STREAM,
      count: totalUnreads,
      newestItemTimestampUsec: String(totalLastUpdate)
    });
    
    // Reader's max is the returned population's total unread count, not a server cap.
    res.json({
      max: totalUnreads,
      unreadcounts
    });
  } catch (err) {
    console.error('Error in getUnreadCount:', err);
    return internalError(res);
  }
};


/**
 * GET /api/greader/reader/api/0/stream/contents/*
 * Get stream contents (articles)
 */
export const getStreamContents = async (req, res) => {
  try {
    const user = req.greaderUser;
    const page = await queryGreaderStream({
      req,
      userId: user.id,
      includeMetadata: true
    });
    
    const response = {
      id: page.streamId,
      updated: Math.floor(Date.now() / 1000),
      items: page.articles.map(serializeGreaderArticle)
    };
    
    if (page.hasMore && page.articles.length > 0) {
      response.continuation = createStreamContinuation(
        page.articles[page.articles.length - 1]
      );
    }
    
    res.json(response);
  } catch (err) {
    console.error('Error in getStreamContents:', err);
    if (err instanceof GreaderStreamError) {
      return badRequest(res, err.message);
    }
    return internalError(res);
  }
};

/**
 * GET /api/greader/reader/api/0/stream/items/ids
 * Get article IDs
 */
export const getStreamItemIds = async (req, res) => {
  try {
    const user = req.greaderUser;
    const page = await queryGreaderStream({
      req,
      userId: user.id,
      maxCount: MAX_STREAM_ITEM_ID_COUNT
    });
    const itemRefs = page.articles.map(article => ({
      id: String(article.id)
    }));
    
    const response = { itemRefs };
    
    if (page.hasMore && page.articles.length > 0) {
      response.continuation = createStreamContinuation(
        page.articles[page.articles.length - 1]
      );
    }
    
    res.json(response);
  } catch (err) {
    console.error('Error in getStreamItemIds:', err);
    if (err instanceof GreaderStreamError) {
      return badRequest(res, err.message);
    }
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/stream/items/contents
 * Get article contents by IDs
 */
export const getStreamItemContents = async (req, res) => {
  try {
    const user = req.greaderUser;
    
    // Item IDs can be passed as arrays or repeated body and query parameters.
    const itemIds = getGreaderParameterValues(req, 'i');
    
    const numericIds = parseRequestedGreaderItemIds(itemIds);
    
    if (numericIds.length === 0) {
      return res.json({ items: [] });
    }
    
    const articles = await Article.findAll({
      where: {
        id: { [Op.in]: numericIds },
        userId: user.id,
        ...canonicalArticleWhere()
      },
      include: articleIncludeForUser(user.id)
    });
    
    const articlesById = new Map(articles.map(article => [
      Number(article.id),
      article
    ]));
    const items = numericIds
      .map(id => articlesById.get(id))
      .filter(Boolean)
      .map(serializeGreaderArticle);
    
    res.json({
      id: 'user/-/state/com.google/reading-list',
      updated: Math.floor(Date.now() / 1000),
      items
    });
  } catch (err) {
    console.error('Error in getStreamItemContents:', err);
    if (err instanceof GreaderItemIdError) {
      return badRequest(res, err.message);
    }
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/edit-tag
 * Edit tags on articles (mark read/unread/starred)
 */
export const editTag = async (req, res) => {
  try {
    const user = req.greaderUser;
    
    // Get every item ID from body and query parameters.
    const itemIds = getGreaderParameterValues(req, 'i');
    
    // Get tags to add/remove
    const addTags = getGreaderParameterValues(req, 'a');
    const removeTags = getGreaderParameterValues(req, 'r');
    
    const numericIds = parseRequestedGreaderItemIds(itemIds);
    
    if (numericIds.length === 0) {
      return res.type('text/plain').send('OK');
    }

    const addSet = new Set(addTags);
    const removeSet = new Set(removeTags);
    const updates = {};
    const mutationTime = new Date();

    // A remove wins when the same supported state is both added and removed.
    if (removeSet.has(READ_STREAM)) {
      updates.status = 'unread';
      updates.readAt = null;
    } else if (addSet.has(READ_STREAM)) {
      updates.status = 'read';
      updates.readAt = mutationTime;
    }
    if (removeSet.has(STARRED_STREAM)) {
      updates.favoriteInd = 0;
    } else if (addSet.has(STARRED_STREAM)) {
      updates.favoriteInd = 1;
    }

    // Unsupported state tags are intentionally ignored for client compatibility.
    if (Object.keys(updates).length > 0) {
      await sequelize.transaction(transaction => Article.update(updates, {
        where: {
          id: { [Op.in]: numericIds },
          userId: user.id,
          ...canonicalArticleWhere()
        },
        transaction
      }));
    }
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in editTag:', err);
    if (err instanceof GreaderItemIdError) {
      return badRequest(res, err.message);
    }
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/mark-all-as-read
 * Mark all articles as read in a stream
 */
export const markAllAsRead = async (req, res) => {
  try {
    const user = req.greaderUser;
    
    const timestamp = getMutationScalar(req, 'ts');
    const olderThan = !timestamp || timestamp === '0'
      ? new Date()
      : parseReaderTimestamp(timestamp);
    if (!olderThan) {
      throw new GreaderStreamError('Invalid ts parameter');
    }

    const { where } = await buildGreaderStreamScope({ req, userId: user.id });
    where.status = 'unread';
    where[Op.and] ??= [];
    where[Op.and].push({ createdAt: { [Op.lte]: olderThan } });

    const mutationTime = new Date();
    await sequelize.transaction(transaction => Article.update(
      { status: 'read', readAt: mutationTime },
      { where, transaction }
    ));
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in markAllAsRead:', err);
    if (err instanceof GreaderStreamError) {
      return badRequest(res, err.message);
    }
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/rename-tag
 * Rename a category/tag
 */
export const renameTag = async (req, res) => {
  try {
    const user = req.greaderUser;
    const source = getMutationScalar(req, 's');
    const dest = getMutationScalar(req, 'dest');
    
    if (!source.startsWith(LABEL_PREFIX) || !dest.startsWith(LABEL_PREFIX)) {
      return badRequest(res, 'Invalid tag format');
    }
    
    const sourceName = decodeLabelStream(source);
    const destName = decodeLabelStream(dest);
    if (!sourceName || !destName) {
      return badRequest(res, 'Invalid tag format');
    }
    
    const category = await renameFeedCategory({
      userId: user.id,
      sourceName,
      destinationName: destName
    });
    
    if (!category) {
      return badRequest(res, 'Category not found');
    }
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in renameTag:', err);
    if (err instanceof GreaderStreamError) {
      return badRequest(res, err.message);
    }
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/disable-tag
 * Delete a category/tag
 */
export const disableTag = async (req, res) => {
  try {
    const user = req.greaderUser;
    const sources = getGreaderParameterValues(req, 's');
    if (
      sources.length === 0 ||
      sources.some(source => !source.startsWith(LABEL_PREFIX))
    ) {
      return badRequest(res, 'Invalid tag format');
    }
    const categoryNames = sources.map(decodeLabelStream);
    if (categoryNames.some(name => !name)) {
      return badRequest(res, 'Invalid tag format');
    }
    await disableFeedCategories({
      userId: user.id,
      categoryNames
    });
    
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in disableTag:', err);
    return internalError(res);
  }
};

/**
 * POST /api/greader/reader/api/0/subscription/import
 * Import subscriptions from an in-memory OPML upload
 */
export const importSubscriptions = async (req, res) => {
  try {
    const content = req.file?.buffer ||
      (Buffer.isBuffer(req.body) ? req.body : null);
    if (!content) {
      return badRequest(res, 'No OPML file provided');
    }

    await importOpmlSubscriptions({
      userId: req.greaderUser.id,
      content
    });
    return res.type('text/plain').send('OK');
  } catch (err) {
    console.error('Error in importSubscriptions:', err);
    if (err instanceof OpmlImportError) {
      return badRequest(res, err.message);
    }
    return internalError(res);
  }
};

/**
 * GET /api/greader/reader/api/0/subscription/export
 * Export subscriptions as OPML
 */
export const exportSubscriptions = async (req, res) => {
  try {
    const user = req.greaderUser;
    
    const opml = await generateOpml(user.id);
    
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="subscriptions.opml"`);
    res.send(opml);
  } catch (err) {
    console.error('Error in exportSubscriptions:', err);
    return internalError(res);
  }
};

/**
 * GET/POST /api/greader/check/compatibility
 * Check API compatibility
 */
export const checkCompatibility = (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(400).type('text/plain').send(
      'FAIL Authorization header was not forwarded'
    );
  }
  if (!parseGreaderAuthorization(authorization)) {
    return res.status(400).type('text/plain').send(
      'FAIL Unsupported Authorization header'
    );
  }

  return res.type('text/plain').send('PASS Authorization header forwarded');
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
  importSubscriptions,
  exportSubscriptions,
  checkCompatibility
};
