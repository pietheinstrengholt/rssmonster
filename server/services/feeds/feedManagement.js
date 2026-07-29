import db from '../../models/index.js';
import discoverRssLink from './discoverRssLink.js';
import parseFeed from './parser.js';
import { Op } from 'sequelize';

const { Article, Category, Feed, User, sequelize } = db;

export const DEFAULT_FEED_CATEGORY_NAME = 'Uncategorized';

// This class identifies expected feed-management failures for API adapters.
export class FeedManagementError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FeedManagementError';
    this.code = code;
    this.details = details;
  }
}

// This function reports whether an error belongs to the feed-management contract.
export const isFeedManagementError = error =>
  error instanceof FeedManagementError;

// This function normalizes one absolute HTTP(S) subscription URL.
export const normalizeFeedUrl = input => {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw new FeedManagementError('INVALID_URL', 'Feed URL is invalid');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FeedManagementError(
      'INVALID_URL',
      'Feed URL must use HTTP or HTTPS'
    );
  }
  if (url.username || url.password) {
    throw new FeedManagementError(
      'INVALID_URL',
      'Feed URL credentials are not allowed'
    );
  }

  url.hash = '';
  return url.toString();
};

// This function maps the regular feed crawl-history selector to a timestamp.
export const toCrawlSinceDate = value => {
  const now = new Date();
  const selector = String(value || '7d');

  try {
    switch (selector) {
      case '7d': {
        const date = new Date(now);
        date.setDate(date.getDate() - 7);
        return date;
      }
      case '1m': {
        const date = new Date(now);
        date.setMonth(date.getMonth() - 1);
        return date;
      }
      case '3m': {
        const date = new Date(now);
        date.setMonth(date.getMonth() - 3);
        return date;
      }
      case '1y': {
        const date = new Date(now);
        date.setFullYear(date.getFullYear() - 1);
        return date;
      }
      case 'all':
        return null; // no limit
      default: {
        const parsed = new Date(selector);
        if (!Number.isNaN(parsed.getTime())) return parsed;

        const fallback = new Date(now);
        fallback.setDate(fallback.getDate() - 7);
        return fallback;
      }
    }
  } catch {
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() - 7);
    return fallback;
  }
};

// This function serializes category and feed creation for one user.
const lockUser = async (userId, transaction) => {
  const user = await User.findByPk(userId, {
    attributes: ['id'],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!user) {
    throw new FeedManagementError('USER_NOT_FOUND', 'User not found');
  }

  return user;
};

// This function returns an owned category by ID or throws a public validation error.
const getOwnedCategory = async (categoryId, userId, transaction) => {
  const category = await Category.findOne({
    where: { id: categoryId, userId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!category) {
    throw new FeedManagementError(
      'CATEGORY_NOT_FOUND',
      'Category not found'
    );
  }

  return category;
};

// This function returns or creates a named category while the user row is locked.
const getOrCreateNamedCategory = async (name, userId, transaction) => {
  const categoryName = String(name || DEFAULT_FEED_CATEGORY_NAME).trim() ||
    DEFAULT_FEED_CATEGORY_NAME;
  const existing = await Category.findOne({
    where: { userId, name: categoryName },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (existing) return existing;

  const maxOrder = await Category.max('categoryOrder', {
    where: { userId },
    transaction
  });

  return Category.create({
    userId,
    name: categoryName,
    categoryOrder: Number.isFinite(Number(maxOrder))
      ? Number(maxOrder) + 1
      : 0
  }, { transaction });
};

// This function renames or merges one owned feed category atomically.
export const renameFeedCategory = async ({
  userId,
  sourceName,
  destinationName
}) => sequelize.transaction(async transaction => {
  await lockUser(userId, transaction);
  const source = await Category.findOne({
    where: { userId, name: sourceName },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!source) return null;
  if (source.name === destinationName) return source;

  const destination = await Category.findOne({
    where: { userId, name: destinationName },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!destination) {
    await source.update({ name: destinationName }, { transaction });
    return source;
  }

  await Feed.update(
    { categoryId: destination.id },
    {
      where: { userId, categoryId: source.id },
      transaction
    }
  );
  await source.destroy({ transaction });
  return destination;
});

// This function disables owned categories and moves their feeds to the default.
export const disableFeedCategories = async ({ userId, categoryNames }) =>
  sequelize.transaction(async transaction => {
    await lockUser(userId, transaction);
    const names = [...new Set(categoryNames
      .map(name => String(name || '').trim())
      .filter(Boolean))];
    if (names.length === 0) return 0;

    const categories = await Category.findAll({
      where: { userId, name: { [Op.in]: names } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const removable = categories.filter(
      category => category.name !== DEFAULT_FEED_CATEGORY_NAME
    );
    if (removable.length === 0) return 0;

    const defaultCategory = await getOrCreateNamedCategory(
      DEFAULT_FEED_CATEGORY_NAME,
      userId,
      transaction
    );
    const categoryIds = removable.map(category => category.id);
    await Feed.update(
      { categoryId: defaultCategory.id },
      {
        where: { userId, categoryId: { [Op.in]: categoryIds } },
        transaction
      }
    );
    await Category.destroy({
      where: { userId, id: { [Op.in]: categoryIds } },
      transaction
    });
    return removable.length;
  });

// This function resolves explicit and protocol-default feed categories.
const resolveCategory = async ({
  userId,
  categoryId,
  categoryName,
  useDefaultCategory,
  transaction
}) => {
  if (categoryId !== undefined && categoryId !== null) {
    return getOwnedCategory(categoryId, userId, transaction);
  }
  if (categoryName) {
    return getOrCreateNamedCategory(categoryName, userId, transaction);
  }
  if (useDefaultCategory) {
    return getOrCreateNamedCategory(
      DEFAULT_FEED_CATEGORY_NAME,
      userId,
      transaction
    );
  }

  throw new FeedManagementError(
    'CATEGORY_NOT_FOUND',
    'Category not found'
  );
};

// This function discovers and normalizes feed metadata through the guarded fetch flow.
export const discoverFeedSubscription = async ({ userId, inputUrl }) => {
  const query = normalizeFeedUrl(inputUrl);
  const directExistingFeed = userId
    ? await Feed.findOne({ where: { userId, url: query } })
    : null;
  if (directExistingFeed) {
    return {
      query,
      feedUrl: directExistingFeed.url,
      feedName: directExistingFeed.feedName,
      feedDesc: directExistingFeed.feedDesc,
      feedType: directExistingFeed.feedType,
      favicon: directExistingFeed.favicon,
      existingFeed: directExistingFeed
    };
  }

  let discoveryResult;
  try {
    discoveryResult = await discoverRssLink.discoverRssLink(
      query,
      undefined,
      { includeParsedFeed: true }
    );
  } catch {
    throw new FeedManagementError(
      'DISCOVERY_FAILED',
      'Unable to discover a valid RSS or Atom feed'
    );
  }

  if (discoveryResult?.cloudflare) {
    throw new FeedManagementError(
      'CLOUDFLARE_BLOCKED',
      'Feed discovery was blocked by Cloudflare',
      { feedUrl: discoveryResult.url }
    );
  }

  const discoveredUrl = typeof discoveryResult === 'string'
    ? discoveryResult
    : discoveryResult?.url;
  if (!discoveredUrl) {
    throw new FeedManagementError(
      'DISCOVERY_FAILED',
      'Unable to discover a valid RSS or Atom feed'
    );
  }

  const feedUrl = normalizeFeedUrl(discoveredUrl);
  let parsedFeed = discoveryResult?.parsedFeed;
  if (!parsedFeed) {
    try {
      parsedFeed = await parseFeed.process(feedUrl);
    } catch {
      throw new FeedManagementError(
        'DISCOVERY_FAILED',
        'Unable to parse the discovered feed'
      );
    }
  }
  if (!parsedFeed) {
    throw new FeedManagementError(
      'DISCOVERY_FAILED',
      'The discovered feed has no metadata'
    );
  }

  const existingFeed = userId
    ? await Feed.findOne({ where: { userId, url: feedUrl } })
    : null;

  return {
    query,
    feedUrl,
    feedName: parsedFeed.title || null,
    feedDesc: parsedFeed.description || null,
    feedType: parsedFeed.format || null,
    favicon: parsedFeed.faviconUrl || null,
    parsedFeed,
    existingFeed
  };
};

// This function updates one feed and its category in a single transaction.
export const updateFeedSubscription = async ({
  userId,
  feedId,
  updates = {},
  categoryId,
  categoryName,
  removeCategory = false,
  transaction: externalTransaction
}) => {
  const operation = async transaction => {
    await lockUser(userId, transaction);
    const feed = await Feed.findOne({
      where: { id: feedId, userId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!feed) {
      throw new FeedManagementError('FEED_NOT_FOUND', 'Feed not found');
    }

    let targetCategory;
    if (categoryId !== undefined && categoryId !== null) {
      targetCategory = await getOwnedCategory(
        categoryId,
        userId,
        transaction
      );
    } else if (categoryName) {
      // An added category deterministically wins when add and remove are both sent.
      targetCategory = await getOrCreateNamedCategory(
        categoryName,
        userId,
        transaction
      );
    } else if (removeCategory) {
      targetCategory = await getOrCreateNamedCategory(
        DEFAULT_FEED_CATEGORY_NAME,
        userId,
        transaction
      );
    }

    await feed.update({
      ...updates,
      ...(targetCategory ? { categoryId: targetCategory.id } : {})
    }, { transaction });

    return feed;
  };

  return externalTransaction
    ? operation(externalTransaction)
    : sequelize.transaction(operation);
};

// This function discovers and creates one subscription through the shared feed flow.
export const addFeedSubscription = async ({
  userId,
  inputUrl,
  categoryId,
  categoryName,
  useDefaultCategory = false,
  title,
  description,
  status = 'active',
  crawlSince = '7d',
  allowExisting = false,
  updateExisting = false
}) => {
  if (categoryId !== undefined && categoryId !== null) {
    const ownedCategory = await Category.findOne({
      where: { id: categoryId, userId },
      attributes: ['id']
    });
    if (!ownedCategory) {
      throw new FeedManagementError(
        'CATEGORY_NOT_FOUND',
        'Category not found'
      );
    }
  }

  const discovery = await discoverFeedSubscription({ userId, inputUrl });

  return sequelize.transaction(async transaction => {
    await lockUser(userId, transaction);
    let existingFeed = await Feed.findOne({
      where: { userId, url: discovery.feedUrl },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (existingFeed) {
      if (!allowExisting) {
        throw new FeedManagementError(
          'FEED_EXISTS',
          'Feed already exists',
          { feed: existingFeed }
        );
      }

      if (
        updateExisting &&
        (title || categoryId !== undefined || categoryName)
      ) {
        existingFeed = await updateFeedSubscription({
          userId,
          feedId: existingFeed.id,
          updates: title ? { feedName: title } : {},
          categoryId,
          categoryName,
          transaction
        });
      }

      return {
        feed: existingFeed,
        created: false,
        query: discovery.query,
        discovery
      };
    }

    const category = await resolveCategory({
      userId,
      categoryId,
      categoryName,
      useDefaultCategory,
      transaction
    });
    const feedName = title ||
      discovery.feedName ||
      new URL(discovery.feedUrl).hostname ||
      discovery.feedUrl;

    try {
      const feed = await Feed.create({
        userId,
        categoryId: category.id,
        feedName,
        feedDesc: description ?? discovery.feedDesc,
        feedType: discovery.feedType,
        url: discovery.feedUrl,
        favicon: discovery.favicon,
        status,
        crawlSince: toCrawlSinceDate(crawlSince)
      }, { transaction });

      return {
        feed,
        created: true,
        query: discovery.query,
        discovery
      };
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

      existingFeed = await Feed.findOne({
        where: { userId, url: discovery.feedUrl },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!existingFeed || !allowExisting) {
        throw new FeedManagementError('FEED_EXISTS', 'Feed already exists');
      }

      return {
        feed: existingFeed,
        created: false,
        query: discovery.query,
        discovery
      };
    }
  });
};

// This function removes one owned feed and its articles atomically.
export const removeFeedSubscription = async ({ userId, feedId }) =>
  sequelize.transaction(async transaction => {
    const feed = await Feed.findOne({
      where: { id: feedId, userId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!feed) return null;

    //delete all articles
    await Article.destroy({
      where: { feedId: feed.id, userId },
      transaction
    });
    //delete feed
    await feed.destroy({ transaction });
    return feed;
  });
