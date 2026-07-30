import db from '../../models/index.js';
import discoverRssLink from './discoverRssLink.js';
import parseFeed from './parser.js';
import { Op } from 'sequelize';

// Provides the shared dependencies used by this service.
const { Article, Category, Feed, User, sequelize } = db;

// Defines the default feed category name enforced by this service.
export const DEFAULT_FEED_CATEGORY_NAME = 'Uncategorized';

// This class identifies expected feed-management failures for API adapters.
export class FeedManagementError extends Error {
  // Performs the constructor operation.
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

  // Rejects processing when url protocol is not http: and url protocol is not https:.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FeedManagementError(
      'INVALID_URL',
      'Feed URL must use HTTP or HTTPS'
    );
  }
  // Rejects processing when url username is available or url password is available.
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
  // Normalizes the now used while performing to crawl since date.
  const now = new Date();
  // Coerces the selector into the representation required while performing to crawl since date.
  const selector = String(value || '7d');

  try {
    // Selects behavior from the supported selector values.
    switch (selector) {
      // Applies the 7d-specific behavior.
      case '7d': {
        // Normalizes the date used while performing to crawl since date.
        const date = new Date(now);
        date.setDate(date.getDate() - 7);
        return date;
      }
      // Applies the 1m-specific behavior.
      case '1m': {
        // Normalizes the date used while performing to crawl since date.
        const date = new Date(now);
        date.setMonth(date.getMonth() - 1);
        return date;
      }
      // Applies the 3m-specific behavior.
      case '3m': {
        // Normalizes the date used while performing to crawl since date.
        const date = new Date(now);
        date.setMonth(date.getMonth() - 3);
        return date;
      }
      // Applies the 1y-specific behavior.
      case '1y': {
        // Normalizes the date used while performing to crawl since date.
        const date = new Date(now);
        date.setFullYear(date.getFullYear() - 1);
        return date;
      }
      // Applies the all-specific behavior.
      case 'all':
        return null; // no limit
      default: {
        // Normalizes the parsed used while performing to crawl since date.
        const parsed = new Date(selector);
        // Returns early when get time is not na n.
        if (!Number.isNaN(parsed.getTime())) return parsed;

        // Normalizes the fallback used while performing to crawl since date.
        const fallback = new Date(now);
        fallback.setDate(fallback.getDate() - 7);
        return fallback;
      }
    }
  } catch {
    // Normalizes the fallback used while performing to crawl since date.
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() - 7);
    return fallback;
  }
};

// This function serializes category and feed creation for one user.
const lockUser = async (userId, transaction) => {
  // Finds the by pk while performing lock user.
  const user = await User.findByPk(userId, {
    attributes: ['id'],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  // Rejects processing when user is unavailable.
  if (!user) {
    throw new FeedManagementError('USER_NOT_FOUND', 'User not found');
  }

  return user;
};

// This function returns an owned category by ID or throws a public validation error.
const getOwnedCategory = async (categoryId, userId, transaction) => {
  // Loads the category needed while performing get owned category.
  const category = await Category.findOne({
    where: { id: categoryId, userId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  // Rejects processing when category is unavailable.
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
  // Derives the category name required while performing get or create named category.
  const categoryName = String(name || DEFAULT_FEED_CATEGORY_NAME).trim() ||
    DEFAULT_FEED_CATEGORY_NAME;
  // Loads the existing needed while performing get or create named category.
  const existing = await Category.findOne({
    where: { userId, name: categoryName },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  // Returns early when existing is available.
  if (existing) return existing;

  // Derives the max order through max while performing get or create named category.
  const maxOrder = await Category.max('categoryOrder', {
    where: { userId },
    transaction
  });

  // Selects the result based on whether number is finite.
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
  // Loads the source needed while performing rename feed category.
  const source = await Category.findOne({
    where: { userId, name: sourceName },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  // Returns no result when source is unavailable.
  if (!source) return null;
  // Returns early when source name is destination name.
  if (source.name === destinationName) return source;

  // Loads the destination needed while performing rename feed category.
  const destination = await Category.findOne({
    where: { userId, name: destinationName },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  // Handles the case where destination is unavailable.
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
    // Collects the names while performing disable feed categories.
    const names = [...new Set(categoryNames
      .map(name => String(name || '').trim())
      .filter(Boolean))];
    // Returns early when names count is value.
    if (names.length === 0) return 0;

    // Loads the categories needed while performing disable feed categories.
    const categories = await Category.findAll({
      where: { userId, name: { [Op.in]: names } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    // Keeps the removable entries eligible while performing disable feed categories.
    const removable = categories.filter(
      category => category.name !== DEFAULT_FEED_CATEGORY_NAME
    );
    // Returns early when removable count is value.
    if (removable.length === 0) return 0;

    // Derives the default category through get or create named category while performing disable feed categories.
    const defaultCategory = await getOrCreateNamedCategory(
      DEFAULT_FEED_CATEGORY_NAME,
      userId,
      transaction
    );
    // Transforms source values into the category id required while performing disable feed categories.
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
  // Returns early when category id is not undefined and category id is not value.
  if (categoryId !== undefined && categoryId !== null) {
    return getOwnedCategory(categoryId, userId, transaction);
  }
  // Returns early when category name is available.
  if (categoryName) {
    return getOrCreateNamedCategory(categoryName, userId, transaction);
  }
  // Returns early when use default category is available.
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
  // Normalizes the query before performing discover feed subscription.
  const query = normalizeFeedUrl(inputUrl);
  // Selects the direct existing feed based on whether user id is available.
  const directExistingFeed = userId
    ? await Feed.findOne({ where: { userId, url: query } })
    : null;
  // Returns early when direct existing feed is available.
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

  // Rejects processing when cloudflare is available.
  if (discoveryResult?.cloudflare) {
    throw new FeedManagementError(
      'CLOUDFLARE_BLOCKED',
      'Feed discovery was blocked by Cloudflare',
      { feedUrl: discoveryResult.url }
    );
  }

  // Selects the discovered url based on whether discovery result is string.
  const discoveredUrl = typeof discoveryResult === 'string'
    ? discoveryResult
    : discoveryResult?.url;
  // Rejects processing when discovered url is unavailable.
  if (!discoveredUrl) {
    throw new FeedManagementError(
      'DISCOVERY_FAILED',
      'Unable to discover a valid RSS or Atom feed'
    );
  }

  // Normalizes the feed url before performing discover feed subscription.
  const feedUrl = normalizeFeedUrl(discoveredUrl);
  let parsedFeed = discoveryResult?.parsedFeed;
  // Handles the case where parsed feed is unavailable.
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
  // Rejects processing when parsed feed is unavailable.
  if (!parsedFeed) {
    throw new FeedManagementError(
      'DISCOVERY_FAILED',
      'The discovered feed has no metadata'
    );
  }

  // Selects the existing feed based on whether user id is available.
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
  // Performs the operation operation.
  const operation = async transaction => {
    await lockUser(userId, transaction);
    // Loads the feed needed while performing operation.
    const feed = await Feed.findOne({
      where: { id: feedId, userId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    // Rejects processing when feed is unavailable.
    if (!feed) {
      throw new FeedManagementError('FEED_NOT_FOUND', 'Feed not found');
    }

    let targetCategory;
    // Handles the case where category id is not undefined and category id is not value.
    if (categoryId !== undefined && categoryId !== null) {
      targetCategory = await getOwnedCategory(
        categoryId,
        userId,
        transaction
      );
    // Handles the case where category name is available.
    } else if (categoryName) {
      // An added category deterministically wins when add and remove are both sent.
      targetCategory = await getOrCreateNamedCategory(
        categoryName,
        userId,
        transaction
      );
    // Handles the case where remove category is available.
    } else if (removeCategory) {
      targetCategory = await getOrCreateNamedCategory(
        DEFAULT_FEED_CATEGORY_NAME,
        userId,
        transaction
      );
    }

    // Selects the result based on whether target category is available.
    await feed.update({
      ...updates,
      ...(targetCategory ? { categoryId: targetCategory.id } : {})
    }, { transaction });

    return feed;
  };

  // Selects the result based on whether external transaction is available.
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
  // Handles the case where category id is not undefined and category id is not value.
  if (categoryId !== undefined && categoryId !== null) {
    // Loads the owned category needed while performing add feed subscription.
    const ownedCategory = await Category.findOne({
      where: { id: categoryId, userId },
      attributes: ['id']
    });
    // Rejects processing when owned category is unavailable.
    if (!ownedCategory) {
      throw new FeedManagementError(
        'CATEGORY_NOT_FOUND',
        'Category not found'
      );
    }
  }

  // Derives the discovery through discover feed subscription while performing add feed subscription.
  const discovery = await discoverFeedSubscription({ userId, inputUrl });

  // Runs the callback required while performing add feed subscription.
  return sequelize.transaction(async transaction => {
    await lockUser(userId, transaction);
    // Loads the existing feed needed while performing add feed subscription.
    let existingFeed = await Feed.findOne({
      where: { userId, url: discovery.feedUrl },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    // Handles the case where existing feed is available.
    if (existingFeed) {
      // Rejects processing when allow existing is unavailable.
      if (!allowExisting) {
        throw new FeedManagementError(
          'FEED_EXISTS',
          'Feed already exists',
          { feed: existingFeed }
        );
      }

      // Handles the case where update existing is available and title is available or category id is not undefined or category name is available.
      if (
        updateExisting &&
        (title || categoryId !== undefined || categoryName)
      ) {
        // Selects the result based on whether title is available.
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

    // Resolves the category while performing add feed subscription.
    const category = await resolveCategory({
      userId,
      categoryId,
      categoryName,
      useDefaultCategory,
      transaction
    });
    // Derives the feed name required while performing add feed subscription.
    const feedName = title ||
      discovery.feedName ||
      new URL(discovery.feedUrl).hostname ||
      discovery.feedUrl;

    try {
      // Performs the create operation while performing add feed subscription.
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
      // Rejects processing when name is not sequelize unique constraint error.
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

      existingFeed = await Feed.findOne({
        where: { userId, url: discovery.feedUrl },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      // Rejects processing when existing feed is unavailable or allow existing is unavailable.
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
    // Loads the feed needed while performing remove feed subscription.
    const feed = await Feed.findOne({
      where: { id: feedId, userId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    // Returns no result when feed is unavailable.
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
