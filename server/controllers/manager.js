import db from '../models/index.js';
const { Feed, Category, Article, BriefingPreference, sequelize } = db;

import Sequelize from "sequelize";
import { Op } from 'sequelize';
import { briefingEligibilitySql } from '../services/articleSearch/briefingEligibility.service.js';
import { buildVisibleArticleWhere } from '../services/articles/visibleArticleScope.js';

const DEFAULT_BRIEFING_SELECTION_PERIOD = '7d';
const OVERVIEW_FEED_ATTRIBUTES = [
  'id',
  'categoryId',
  'feedName',
  'feedDesc',
  'url',
  'favicon',
  'errorCount',
  'errorMessage',
  'errorSince',
  'status',
  'updateIntervalMinutes',
  'feedTags',
  'itemFilter',
  'generateEmbeddings',
  'applyAiAnalysis'
];
const OVERVIEW_COUNT_FIELDS = [
  'briefingCount',
  'unreadCount',
  'readCount',
  'favoriteCount',
  'hotCount',
  'clickedCount'
];

// Formats a UTC timestamp consistently for MySQL DATETIME and SQLite text comparison.
const formatDatabaseTimestamp = date => date.toISOString().replace('T', ' ').replace('Z', '');

const buildCategoriesStructure = categoriesRaw => categoriesRaw.map(categoryRow => {
  const category = categoryRow.get({ plain: true });

  category.readCount = 0;
  category.unreadCount = 0;
  category.briefingCount = 0;
  category.favoriteCount = 0;
  category.hotCount = 0;
  category.clickedCount = 0;

  category.feeds = (category.feeds || []).map(feed => ({
    ...feed,
    readCount: 0,
    unreadCount: 0,
    briefingCount: 0,
    favoriteCount: 0,
    hotCount: 0,
    clickedCount: 0
  }));

  return category;
});

const buildCategoryFeedMaps = categories => {
  const categoryMap = {};
  const feedMap = {};

  categories.forEach(category => {
    categoryMap[category.id] = category;
    category.feeds.forEach(feed => {
      feedMap[feed.id] = { feed, category };
    });
  });

  return { categoryMap, feedMap };
};

const loadCategoriesStructure = userId => Category.findAll({
  where: { userId },
  attributes: ['id', 'name', 'categoryOrder', 'iconName'],
  include: [{
    model: Feed,
    attributes: OVERVIEW_FEED_ATTRIBUTES,
    required: false
  }],
  order: ['categoryOrder', 'name']
});

// Applies the selected grouping while honoring developing-event presentation.
const applyGroupingFilter = (baseWhere, grouping, includeDevelopingEvents) => {
  if (grouping === 'event') {
    const selectedEventArticleColumn = includeDevelopingEvents
      ? 'COALESCE(grouped_event.developingArticleId, grouped_event.representativeArticleId)'
      : 'grouped_event.representativeArticleId';

    baseWhere[Op.or] = [
      {
        eventId: {
          [Op.is]: null
        }
      },
      Sequelize.literal(`EXISTS (
        SELECT 1
        FROM events grouped_event
        WHERE grouped_event.id = articles.eventId
          AND grouped_event.userId = articles.userId
          AND articles.id = ${selectedEventArticleColumn}
      )`)
    ];
  }

  if (grouping === 'topic') {
    baseWhere.id = {
      [Op.in]: Sequelize.literal(`(
        SELECT e.representativeArticleId
        FROM events e
        INNER JOIN (
          SELECT userId, topicId, MAX(eventStrength) AS maxStrength
          FROM events
          WHERE topicId IS NOT NULL
          GROUP BY userId, topicId
        ) t
          ON e.userId = t.userId
          AND e.topicId = t.topicId
          AND e.eventStrength = t.maxStrength
        WHERE e.topicId IS NOT NULL
          AND e.id = (
            SELECT MAX(e2.id)
            FROM events e2
            WHERE e2.userId = e.userId
              AND e2.topicId = e.topicId
              AND e2.eventStrength = e.eventStrength
          )
      )`)
    };
  }
};

// Builds the user-owned article scope used by all overview counts.
const buildOverviewWhere = async ({ userId, grouping, includeDevelopingEvents }) => {
  const baseWhere = await buildVisibleArticleWhere(userId);

  applyGroupingFilter(baseWhere, grouping, includeDevelopingEvents);

  return baseWhere;
};

// Loads the user's preferences and builds the shared Daily Briefing count predicate.
const loadBriefingCountConfig = async userId => {
  const briefingPreferences = await BriefingPreference.findOne({
    where: { userId },
    attributes: [
      'selectionPeriod',
      'includeOnlyUnreadArticles',
      'markAsReadOnScroll',
      'minDistinctSources',
      'prioritizeHighTrust',
      'showOnlyInterestMatchedArticles',
      'showOnlyDevelopingEventArticles'
    ],
    raw: true
  });
  const briefingSelectionPeriod = briefingPreferences?.selectionPeriod === '24h'
    ? '24h'
    : DEFAULT_BRIEFING_SELECTION_PERIOD;
  const briefingWindowDays = briefingSelectionPeriod === '24h' ? 1 : 7;
  const briefingIncludeOnlyUnreadArticles = Boolean(
    Number(briefingPreferences?.includeOnlyUnreadArticles)
  );
  const briefingMarkAsReadOnScroll = briefingIncludeOnlyUnreadArticles && Boolean(
    Number(briefingPreferences?.markAsReadOnScroll)
  );
  const briefingStatusCondition = briefingIncludeOnlyUnreadArticles
    ? "AND articles.status = 'unread'"
    : '';
  const briefingMinDistinctSources = Number(briefingPreferences?.minDistinctSources) || 1;
  const briefingPrioritizeHighTrust = Boolean(
    Number(briefingPreferences?.prioritizeHighTrust)
  );
  const briefingShowOnlyDevelopingEventArticles = Boolean(
    Number(briefingPreferences?.showOnlyDevelopingEventArticles)
  );
  const briefingPublishedTo = new Date();
  const briefingPublishedFrom = new Date(
    briefingPublishedTo.getTime() - briefingWindowDays * 24 * 60 * 60 * 1000
  );
  const briefingEligibility = briefingEligibilitySql({
    minDistinctSources: briefingMinDistinctSources,
    showOnlyInterestMatchedArticles: Boolean(
      Number(briefingPreferences?.showOnlyInterestMatchedArticles)
    ),
    showOnlyDevelopingEventArticles: briefingShowOnlyDevelopingEventArticles
  });

  return {
    briefingSelectionPeriod,
    briefingIncludeOnlyUnreadArticles,
    briefingMarkAsReadOnScroll,
    briefingMinDistinctSources,
    briefingPrioritizeHighTrust,
    briefingShowOnlyDevelopingEventArticles,
    replacements: {
      briefingPublishedFrom: formatDatabaseTimestamp(briefingPublishedFrom),
      briefingPublishedTo: formatDatabaseTimestamp(briefingPublishedTo)
    },
    countSql: `COUNT(CASE WHEN
      articles.publishedAt >= :briefingPublishedFrom
      AND articles.publishedAt <= :briefingPublishedTo
      AND ${briefingEligibility}
      ${briefingStatusCondition}
    THEN 1 END)`
  };
};

// Sums the per-feed aggregation into the global overview counts.
const buildOverviewTotals = (groupedRows, briefingConfig) => {
  const totals = groupedRows.reduce((result, row) => {
    for (const field of OVERVIEW_COUNT_FIELDS) result[field] += Number(row[field]) || 0;
    return result;
  }, Object.fromEntries(OVERVIEW_COUNT_FIELDS.map(field => [field, 0])));

  return {
    briefingSelectionPeriod: briefingConfig.briefingSelectionPeriod,
    briefingIncludeOnlyUnreadArticles: briefingConfig.briefingIncludeOnlyUnreadArticles,
    briefingMarkAsReadOnScroll: briefingConfig.briefingMarkAsReadOnScroll,
    briefingMinDistinctSources: briefingConfig.briefingMinDistinctSources,
    briefingPrioritizeHighTrust: briefingConfig.briefingPrioritizeHighTrust,
    briefingShowOnlyDevelopingEventArticles:
      briefingConfig.briefingShowOnlyDevelopingEventArticles,
    ...totals
  };
};

const loadGroupedFeedCounts = (baseWhere, briefingConfig) => Feed.findAll({
  include: [{
    model: Article,
    attributes: [],
    where: baseWhere
  }],
  attributes: [
    'categoryId',
    ['id', 'feedId'],
    [Sequelize.literal(briefingConfig.countSql), 'briefingCount'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`status` = 'unread' THEN 1 END)"), 'unreadCount'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`status` = 'read' THEN 1 END)"), 'readCount'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`favoriteInd` = 1 THEN 1 END)"), 'favoriteCount'],
    [Sequelize.literal("COUNT(CASE WHEN `articles`.`hotInd` = 1 THEN 1 END)"), 'hotCount'],
    [Sequelize.literal("SUM(CASE WHEN `articles`.`clickedAmount` > 0 THEN 1 ELSE 0 END)"), 'clickedCount']
  ],
  replacements: briefingConfig.replacements,
  group: ['feeds.categoryId', 'feeds.id'],
  order: ['id'],
  raw: true
});

const mergeCountsIntoStructure = (categories, groupedRows) => {
  const { feedMap } = buildCategoryFeedMaps(categories);

  groupedRows.forEach(row => {
    const feedEntry = feedMap[row.feedId];
    if (!feedEntry) return;

    const unread = Number(row.unreadCount) || 0;
    const read = Number(row.readCount) || 0;
    const briefing = Number(row.briefingCount) || 0;
    const favorite = Number(row.favoriteCount) || 0;
    const hot = Number(row.hotCount) || 0;
    const clicked = Number(row.clickedCount) || 0;

    feedEntry.feed.unreadCount = unread;
    feedEntry.feed.readCount = read;
    feedEntry.feed.briefingCount = briefing;
    feedEntry.feed.favoriteCount = favorite;
    feedEntry.feed.hotCount = hot;
    feedEntry.feed.clickedCount = clicked;

    feedEntry.category.unreadCount += unread;
    feedEntry.category.readCount += read;
    feedEntry.category.briefingCount += briefing;
    feedEntry.category.favoriteCount += favorite;
    feedEntry.category.hotCount += hot;
    feedEntry.category.clickedCount += clicked;
  });

  return categories;
};

// Builds the sparse count-only hierarchy consumed by clients with cached overview structure.
const buildCountSnapshot = groupedRows => {
  const categories = new Map();

  groupedRows.forEach(row => {
    const counts = Object.fromEntries(
      OVERVIEW_COUNT_FIELDS.map(field => [field, Number(row[field]) || 0])
    );
    let category = categories.get(row.categoryId);
    if (!category) {
      category = {
        id: row.categoryId,
        briefingCount: 0,
        unreadCount: 0,
        readCount: 0,
        favoriteCount: 0,
        hotCount: 0,
        clickedCount: 0,
        feeds: []
      };
      categories.set(row.categoryId, category);
    }

    for (const field of Object.keys(counts)) category[field] += counts[field];
    category.feeds.push({ id: row.feedId, categoryId: row.categoryId, ...counts });
  });

  return [...categories.values()];
};

// Loads the user's category and feed structure without article counts.
export const getOverviewLite = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    const categoriesRaw = await loadCategoriesStructure(userId);
    const categories = buildCategoriesStructure(categoriesRaw);

    return res.status(200).json({
      total: 0,
      readCount: 0,
      unreadCount: 0,
      favoriteCount: 0,
      hotCount: 0,
      clickedCount: 0,
      categories
    });
  } catch (err) {
    console.error('Error in getOverviewLite:', err);
    return res.status(500).json({ error: 'Unable to load overview' });
  }
};

// Loads the user's article counts grouped into their category and feed structure.
export const getOverviewCounts = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    const grouping = String(req.body?.grouping || 'none');
    const includeDevelopingEvents = req.body?.includeDevelopingEvents === true;
    const [baseWhere, briefingConfig] = await Promise.all([
      buildOverviewWhere({ userId, grouping, includeDevelopingEvents }),
      loadBriefingCountConfig(userId)
    ]);
    const grouped = await loadGroupedFeedCounts(baseWhere, briefingConfig);
    const totals = buildOverviewTotals(grouped, briefingConfig);

    return res.status(200).json({
      total: totals.unreadCount + totals.readCount,
      ...totals,
      categories: buildCountSnapshot(grouped)
    });
  } catch (err) {
    console.error('Error in getOverviewCounts:', err);
    return res.status(500).json({ error: 'Unable to load overview counts' });
  }
};

// Loads the user's complete category, feed, and article count overview.
export const getOverview = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    const grouping = String(req.body?.grouping || 'none');
    const includeDevelopingEvents = req.body?.includeDevelopingEvents === true;
    const [baseWhere, categoriesRaw, briefingConfig] = await Promise.all([
      buildOverviewWhere({ userId, grouping, includeDevelopingEvents }),
      loadCategoriesStructure(userId),
      loadBriefingCountConfig(userId)
    ]);
    const categories = buildCategoriesStructure(categoriesRaw);
    const grouped = await loadGroupedFeedCounts(baseWhere, briefingConfig);
    const totals = buildOverviewTotals(grouped, briefingConfig);

    mergeCountsIntoStructure(categories, grouped);

    return res.status(200).json({
      total: totals.unreadCount + totals.readCount,
      ...totals,
      categories
    });

  } catch (err) {
    console.error('Error in getOverview:', err);
    return res.status(500).json({ error: 'Unable to load overview' });
  }
};

// Updates the display order of categories owned by the user.
export const categoryUpdateOrder = async (req, res, _next) => {

  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  //categories are received in the preferred order
  const order = req.body.order;

  if (order === undefined) {
    return res.status(400).json({
      message: "order is not set"
    });
  }

  try {
    if (order.length > 0) {
      await sequelize.transaction(async transaction => {
        await Promise.all(order.map((item, categoryOrder) =>
          Category.update({
            categoryOrder
          }, {
            where: {
              userId: userId,
              id: item
            },
            transaction
          })
        ));
      });
    }

    return res.status(200).json("order updated");
  } catch (err) {
    console.error('Error in categoryUpdateOrder:', err);
    return res.status(500).json({ error: 'Unable to update category order' });
  }
};

// Moves a user-owned feed into a user-owned category.
export const feedChangeCategory = async (req, res, _next) => {
  const userId = req.userData.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  //categories are received in the preferred order
  const feedId = req.body.feedId;
  const categoryId = req.body.categoryId;

  if (feedId === undefined || categoryId === undefined) {
    return res.status(400).json({
      message: "feedId or categoryId is not set"
    });
  }

  try {
    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId: userId
      }
    })

    const category = await Category.findOne({
      where: {
        id: categoryId,
        userId: userId
      }
    })

    if (!feed || !category) {
      return res.status(404).json({
        message: "Feed or category not found"
      });
    }

    await feed.update({
      categoryId: req.body.categoryId
    }, { where: { userId: userId } });

    return res.status(200).json(feed);
  } catch (err) {
    console.error('Error in feedChangeCategory:', err);
    return res.status(500).json({ error: 'Unable to change feed category' });
  }
};

export default {
  getOverview,
  getOverviewLite,
  getOverviewCounts,
  categoryUpdateOrder,
  feedChangeCategory
}
