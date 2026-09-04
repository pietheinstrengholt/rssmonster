import { Op } from 'sequelize';

import db from '../../../models/index.js';
import { canonicalArticleWhere } from '../../duplicates/articleDuplicates.js';
import normalizeUrl from '../content/normalizeUrl.js';

const { Article, Hotlink } = db;

const DAY_MS = 24 * 60 * 60 * 1000;
export const HOT_ARTICLE_WINDOW_DAYS = 14;

// Returns unique positive user identifiers in their original order.
const normalizeUserIds = processedUserIds => [...new Set(
  [...(processedUserIds || [])]
    .map(userId => Number(userId))
    .filter(userId => Number.isSafeInteger(userId) && userId > 0)
)];

// Builds one user's normalized URL → source feed → observation count index.
const buildUserObservationCounts = (observations) => {
  const countsByUrl = new Map();

  for (const observation of observations) {
    const feedId = Number(observation.feedId);
    if (!observation.url || !Number.isSafeInteger(feedId) || feedId <= 0) continue;

    const normalizedUrl = normalizeUrl(observation.url);
    const countsByFeed = countsByUrl.get(normalizedUrl) || new Map();
    countsByFeed.set(
      feedId,
      (countsByFeed.get(feedId) || 0) + 1
    );
    countsByUrl.set(normalizedUrl, countsByFeed);
  }

  return countsByUrl;
};

// Loads the bounded state used to reconcile hot article indicators.
const reconcileHotArticles = async ({ processedUserIds, cutoffDate, transaction = null }) => {
  const userIds = normalizeUserIds(processedUserIds);
  const cutoff = new Date(cutoffDate);

  if (Number.isNaN(cutoff.getTime())) {
    throw new TypeError('A valid hot article cutoff date is required');
  }

  if (userIds.length === 0) {
    return {
      userIds,
      cutoffDate: cutoff,
      articles: [],
      observationCountsByUserId: new Map(),
      scannedCount: 0,
      updatedCount: 0,
      hotCount: 0,
      madeHotCount: 0,
      clearedCount: 0,
      agedOutClearedCount: 0
    };
  }

  const [articles, observations] = await Promise.all([
    Article.findAll({
      attributes: [
        'id',
        'userId',
        'feedId',
        'normalizedUrl',
        'hotInd',
        'hotlinks'
      ],
      where: {
        userId: { [Op.in]: userIds },
        publishedAt: { [Op.gte]: cutoff },
        ...canonicalArticleWhere()
      },
      ...(transaction ? { transaction } : {}),
      raw: true
    }),
    Hotlink.findAll({
      attributes: ['userId', 'feedId', 'sourceArticleId', 'url'],
      where: {
        userId: { [Op.in]: userIds },
        createdAt: { [Op.gte]: cutoff }
      },
      ...(transaction ? { transaction } : {}),
      raw: true
    })
  ]);

  // Observations are retained independently from their source article state. A
  // revision or semantic pass can later filter or deduplicate that source, so
  // only observations whose linked source is still canonical may contribute.
  // Legacy observations without sourceArticleId retain their historical meaning.
  const sourceArticleIds = [...new Set(observations
    .map(observation => Number(observation.sourceArticleId))
    .filter(sourceArticleId => Number.isSafeInteger(sourceArticleId) && sourceArticleId > 0))];
  let eligibleSourceArticleIds = new Set();

  if (sourceArticleIds.length > 0) {
    const eligibleSourceArticles = await Article.findAll({
      attributes: ['id'],
      where: {
        id: { [Op.in]: sourceArticleIds },
        userId: { [Op.in]: userIds },
        ...canonicalArticleWhere()
      },
      ...(transaction ? { transaction } : {}),
      raw: true
    });
    eligibleSourceArticleIds = new Set(
      eligibleSourceArticles.map(article => Number(article.id))
    );
  }

  const observationsByUserId = new Map(userIds.map(userId => [userId, []]));
  for (const observation of observations) {
    const sourceArticleId = Number(observation.sourceArticleId);
    if (
      Number.isSafeInteger(sourceArticleId) &&
      sourceArticleId > 0 &&
      !eligibleSourceArticleIds.has(sourceArticleId)
    ) {
      continue;
    }
    observationsByUserId.get(Number(observation.userId))?.push(observation);
  }

  const observationCountsByUserId = new Map();
  for (const [userId, userObservations] of observationsByUserId) {
    observationCountsByUserId.set(
      userId,
      buildUserObservationCounts(userObservations)
    );
  }

  let updatedCount = 0;
  let hotCount = 0;
  let madeHotCount = 0;
  let clearedCount = 0;

  for (const article of articles) {
    const countsByFeed = article.normalizedUrl
      ? observationCountsByUserId
        .get(Number(article.userId))
        ?.get(normalizeUrl(article.normalizedUrl))
      : null;
    const articleFeedId = Number(article.feedId);
    let hotlinks = 0;

    for (const [sourceFeedId, observationCount] of countsByFeed || []) {
      if (sourceFeedId !== articleFeedId) hotlinks += observationCount;
    }

    const hotInd = hotlinks > 0 ? 1 : 0;
    if (hotInd === 1) hotCount += 1;

    if (
      Number(article.hotInd || 0) === hotInd &&
      Number(article.hotlinks || 0) === hotlinks
    ) {
      continue;
    }

    await Article.update(
      { hotInd, hotlinks },
      {
        where: { id: article.id, userId: article.userId },
        ...(transaction ? { transaction } : {})
      }
    );
    updatedCount += 1;
    if (hotInd === 1 && Number(article.hotInd || 0) !== 1) madeHotCount += 1;
    if (hotInd === 0) clearedCount += 1;
  }

  const [agedOutClearedCount] = await Article.update(
    { hotInd: 0, hotlinks: 0 },
    {
      where: {
        userId: { [Op.in]: userIds },
        publishedAt: { [Op.lt]: cutoff },
        [Op.or]: [
          { hotInd: { [Op.ne]: 0 } },
          { hotlinks: { [Op.ne]: 0 } }
        ]
      },
      ...(transaction ? { transaction } : {})
    }
  );

  return {
    userIds,
    cutoffDate: cutoff,
    articles,
    observationCountsByUserId,
    scannedCount: articles.length,
    updatedCount: updatedCount + agedOutClearedCount,
    hotCount,
    madeHotCount,
    clearedCount: clearedCount + agedOutClearedCount,
    agedOutClearedCount
  };
};

export const hotArticleCutoffDate = (now = new Date()) =>
  new Date(new Date(now).getTime() - HOT_ARTICLE_WINDOW_DAYS * DAY_MS);

export { buildUserObservationCounts, normalizeUserIds };
export default reconcileHotArticles;
