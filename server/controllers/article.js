import htmlToVisibleText from '../services/crawl/content/htmlToVisibleText.js';
import { updateArticleBehavior } from '../services/articles/updateArticleBehavior.js';
import db from '../models/index.js';
const { Article, BriefingPreference, Feed, Tag, Event } = db;
import { Op } from 'sequelize';
import { searchArticles } from "../services/articleSearch/articleSearch.service.js";
import { MAX_ARTICLE_SEARCH_LENGTH } from '../services/articleSearch/articleQueryParser.service.js';
import { ArticleSearchCursorError } from '../services/articleSearch/articleSearchCursor.service.js';
import {
  DailyBriefingRequestError,
  getDailyBriefing as getDailyBriefingService
} from '../services/dailyBriefing/dailyBriefing.service.js';
import { resolvePredictedAffinity } from '../services/recommendations/predictedAffinityResolver.js';
import { getArticleRecommendations as getArticleRecommendationsService } from '../services/recommendations/articleRecommendations.js';
import { buildRecommendationPresentation } from '../services/recommendations/recommendedScore.js';
import { refreshExpiredArticleInterests } from '../services/recommendations/refreshExpiredArticleInterests.js';
import { loadInterestIslandAttributions } from '../services/recommendations/recommendationAttribution.js';
import { createRequestPersonalization } from '../services/recommendations/requestPersonalization.js';
import { explainArticleInterests } from '../services/score/scoreArticlesFromIslands.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';
import { retryDatabaseWrite } from '../utils/databaseRetry.js';

const RELATED_STORY_ARTICLE_LIMIT = 50;

const parsePublicationBound = (value, field) => {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ArticleSearchCursorError(field === 'publishedAfter' ? 'PUBLISHED_AFTER_INVALID' : 'PUBLISHED_BEFORE_INVALID', `${field} must be a UTC ISO timestamp.`, 400);
  }
  return new Date(value).toISOString();
};

// This function serializes a related-story row without relying on direct association properties.
const serializeRelatedStoryArticle = articleRow => {
  const article = typeof articleRow?.get === 'function'
    ? articleRow.get({ plain: true })
    : articleRow;
  const feed = article?.feed || {};

  return {
    id: article?.id,
    title: article?.title,
    url: article?.url,
    publishedAt: article?.publishedAt,
    feed: {
      id: feed.id ?? null,
      name: feed.feedName || 'Unknown feed',
      favicon: feed.favicon || null
    }
  };
};

// This function normalizes article grouping values used by API consumers.
const normalizeGrouping = value => (value === 'event' ? value : 'none');

const cursorCompatibleScope = ({ sort, search }) => (
  ['asc', 'desc'].includes(String(sort || 'desc').toLowerCase())
  && !/(?:^|\s)sort:(?:topStories|recommended|quality)(?:\s|$)/i.test(String(search || ''))
  && !/(?:^|\s)(?:quality|freshness):/i.test(String(search || ''))
);

const markScopedArticlePageAsRead = async ({ userId, itemIds, grouping, readAt }) => {
  if (!itemIds.length) return { updatedCount: 0, expandedEventCount: 0 };

  let eventIds = [];
  if (grouping === 'event') {
    const selectedArticles = await Article.findAll({
      where: { id: { [Op.in]: itemIds }, userId, ...canonicalArticleWhere() },
      attributes: ['id', 'eventId']
    });

    eventIds = [...new Set(selectedArticles.map(article => article.eventId).filter(Boolean))];
  }

  const [updatedCount] = await retryDatabaseWrite(() => Article.update(
    { status: 'read', readAt },
    {
      where: {
        userId,
        ...canonicalArticleWhere(),
        status: 'unread',
        ...(eventIds.length
          ? { [Op.or]: [{ id: { [Op.in]: itemIds } }, { eventId: { [Op.in]: eventIds } }] }
          : { id: { [Op.in]: itemIds } })
      }
    }
  ));
  return { updatedCount, expandedEventCount: eventIds.length };
};

// This function attaches feed-level predicted affinity hints to unread articles.
const attachPredictedAffinity = articles => {
  for (const article of articles) {
    const feed = article.Feed;

    if (!feed) continue;

    const prediction = resolvePredictedAffinity({
      article,
      feed
    });

    if (prediction && prediction.predictedAffinity) {
      article.setDataValue('presentation', {
        predictedAffinity: prediction.predictedAffinity,
        confidence: prediction.confidence,
        source: prediction.source,
        engagementScore: prediction.engagementScore
      });
    }
  }
};

// This function batch-loads article details with presentation metadata.
const loadArticleDetails = async (userId, articlesArray, personalization = createRequestPersonalization(userId)) => {
  // Keep this projection aligned with Article.vue props and ArticleReaderLayout.vue direct reads;
  // when either frontend consumer changes, update this list and the article-details API tests together.
  const articles = await Article.findAll({
    attributes: [
      'id',
      'feedId',
      'status',
      'favoriteInd',
      'clickedAmount',
      'hotInd',
      'media',
      'url',
      'imageUrl',
      'title',
      'author',
      'authors',
      'originalSource',
      'description',
      'descriptionHtml',
      'descriptionText',
      'contentHtml',
      'contentText',
      'contentSummaryBullets',
      'aiAnalysisStatus',
      'aiAnalysisCompletedAt',
      'aiAnalysisProvenance',
      'isOfficialSource',
      'officialOrganization',
      'eventId',
      'duplicateCount',
      'advertisementScore',
      'sentimentScore',
      'qualityScore',
      'interestScore',
      'interestScoredAt',
      'attentionBucket',
      'publishedAt',
      'firstSeen',
      'isDevelopingStory',
      'quality'
    ],
    include: [
      {
        model: Feed,
        required: true,
        attributes: [
          'id',
          'feedName',
          'url',
          'categoryId',
          'favicon',
          'feedTrust',
          'feedDuplicationRate',
          'feedAttentionAvg',
          'feedDeepReadRatio',
          'feedSkimRatio',
          'feedIgnoreRatio',
          'feedClickAvg',
          'feedClickRatio',
          'feedAttentionSampleSize'
        ]
      },
      {
        model: Tag,
        required: false,
        attributes: ['id', 'name', 'tagType']
      },
      {
        model: Event,
        as: 'event',
        required: false,
        attributes: [
          'id',
          'name',
          'generatedName',
          'articleCount',
          'sourceCount',
          'sourceDiversityScore',
          'representativeArticleId',
          'developingArticleId'
        ]
      }
    ],
    where: { userId, id: articlesArray, ...canonicalArticleWhere() }
  });

  // Preserve incoming ID order
  const idIndexMap = new Map(articlesArray.map((id, i) => [String(id), i]));
  articles.sort((a, b) => idIndexMap.get(String(a.id)) - idIndexMap.get(String(b.id)));

  for (const article of articles) {
    article.setDataValue('quality', article.quality);
  }

  await refreshExpiredArticleInterests(userId, articles, personalization.now, personalization);
  attachPredictedAffinity(articles);
  const interestIslandByArticleId = await loadInterestIslandAttributions(userId, articles, personalization);

  for (const article of articles) {
    article.setDataValue('recommendation', buildRecommendationPresentation(article, {
      interestIsland: interestIslandByArticleId.get(String(article.id)) || null
    }));
  }

  return articles;
};

// This function returns the authenticated user's structured, read-only Daily Briefing.
export const getDailyBriefing = async (req, res, _next) => {
  const userId = req.userData?.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  try {
    const briefingPreferences = await BriefingPreference.findOne({
      where: { userId },
      attributes: [
        'selectionPeriod',
        'includeHotArticles',
        'includeOnlyUnreadArticles',
        'includeDevelopingEvents',
        'minDistinctSources',
        'prioritizeHighTrust',
        'showOnlyInterestMatchedArticles',
        'showOnlyDevelopingEventArticles'
      ],
      raw: true
    });
    const briefing = await getDailyBriefingService({
      userId,
      period: briefingPreferences?.selectionPeriod || req.query.period,
      status: briefingPreferences
        ? (Number(briefingPreferences.includeOnlyUnreadArticles) ? 'unread' : 'all')
        : req.query.status,
      includeHotArticles: Boolean(Number(briefingPreferences?.includeHotArticles ?? true)),
      minDistinctSources: Number(briefingPreferences?.minDistinctSources) || 1,
      includeDevelopingEvents: Boolean(
        Number(briefingPreferences?.includeDevelopingEvents)
      ),
      prioritizeHighTrust: Boolean(Number(briefingPreferences?.prioritizeHighTrust)),
      showOnlyInterestMatchedArticles: Boolean(
        Number(briefingPreferences?.showOnlyInterestMatchedArticles)
      ),
      showOnlyDevelopingEventArticles: Boolean(
        Number(briefingPreferences?.showOnlyDevelopingEventArticles)
      )
    });

    return res.status(200).json(briefing);
  } catch (err) {
    if (err instanceof DailyBriefingRequestError) {
      return res.status(400).json({ error: err.message });
    }

    console.error('Error in getDailyBriefing:', err);
    return res.status(500).json({ error: 'Unable to load Daily Briefing' });
  }
};

export const getArticles = async (req, res) => {
  try {
    const userId = req.userData.userId;
    const search = String(req.query.search || '');
    if (search.length > MAX_ARTICLE_SEARCH_LENGTH) {
      return res.status(400).json({
        error: {
          code: 'SEARCH_TOO_LONG',
          message: `search must not exceed ${MAX_ARTICLE_SEARCH_LENGTH} characters.`
        }
      });
    }
    const newerThanArticleIdValue = req.query.newerThanArticleId;
    const publishedAfter = parsePublicationBound(req.query.publishedAfter, 'publishedAfter');
    const publishedBefore = parsePublicationBound(req.query.publishedBefore, 'publishedBefore');
    let newerThanArticleId = null;
    if (newerThanArticleIdValue !== undefined) {
      if (!/^\d+$/.test(String(newerThanArticleIdValue))) {
        return res.status(400).json({ error: 'newerThanArticleId must be a non-negative integer' });
      }
      newerThanArticleId = Number(newerThanArticleIdValue);
      if (!Number.isSafeInteger(newerThanArticleId)) {
        return res.status(400).json({ error: 'newerThanArticleId must be a non-negative integer' });
      }
    }
    const cursorPagination = req.query.pagination === 'cursor';
    let pagination = null;
    if (cursorPagination) {
      const pageSizeValue = req.query.pageSize ?? '20';
      if (!/^\d+$/.test(String(pageSizeValue))) {
        return res.status(400).json({
          error: { code: 'PAGE_SIZE_INVALID', message: 'pageSize must be an integer between 1 and 100.' }
        });
      }

      const pageSize = Number(pageSizeValue);
      if (pageSize < 1 || pageSize > 100) {
        return res.status(400).json({
          error: { code: 'PAGE_SIZE_INVALID', message: 'pageSize must be an integer between 1 and 100.' }
        });
      }

      pagination = {
        pageSize,
        cursor: req.query.cursor || null
      };
    }
    const personalization = createRequestPersonalization(userId);
    const searchOptions = {
      userId,
      search,
      categoryId: req.query.categoryId,
      feedId: req.query.feedId,
      status: newerThanArticleId === null ? req.query.status : 'unread',
      minAdvertisementScore: req.query.minAdvertisementScore,
      minSentimentScore: req.query.minSentimentScore,
      minQualityScore: req.query.minQualityScore,
      sort: req.query.sort,
      tag: req.query.tag,
      viewMode: req.query.viewMode,
      grouping: req.query.grouping || 'none',
      includeDevelopingEvents: req.query.includeDevelopingEvents === 'true',
      persistSettings: newerThanArticleId === null && req.query.persistSettings !== 'false',
      countOnly: newerThanArticleId !== null,
      unreadOnly: newerThanArticleId !== null,
      includeSnapshot: newerThanArticleId === null,
      minArticleIdExclusive: newerThanArticleId,
      publishedAfter,
      publishedBefore,
      includeDiagnostics: req.query.diagnostics === 'true',
      pagination,
      personalization
    };
    const result = await searchArticles({
      ...searchOptions,
      includeOldestPublishedAt: req.query.includeOldestPublishedAt === 'true'
        && (cursorPagination || req.query.ageCutoff === 'all'),
      oldestBeforeAgeCutoff: cursorPagination && req.query.ageCutoff !== 'all'
    });

    if (newerThanArticleId !== null) {
      return res.status(200).json({ newerArticleCount: result.articleCount });
    }

    if (req.query.includeOldestPublishedAt === 'true' && (searchOptions.status ?? 'unread') === 'unread'
      && !cursorPagination && req.query.ageCutoff !== 'all') {
      const baseline = await searchArticles({
        ...searchOptions,
        pagination: null,
        persistSettings: false,
        includeSnapshot: false,
        includeOldestPublishedAt: true,
        ...(req.query.ageCutoff !== 'all' ? { publishedAfter: null, publishedBefore: null } : {})
      });
      result.oldestPublishedAt = baseline.oldestPublishedAt;
    }

    if (cursorPagination) {
      result.page.articles = result.page.itemIds.length
        ? await loadArticleDetails(userId, result.page.itemIds, personalization)
        : [];
      return res.status(200).json(result);
    }

    if (req.query.includeFirstPage === 'true' && result.itemIds.length > 0) {
      const pageSize = req.query.viewMode === 'minimal' ? 50 : 20;
      const firstPageIds = result.itemIds.slice(0, pageSize);
      result.firstPage = await loadArticleDetails(userId, firstPageIds, personalization);
      if (result.diagnostics) result.diagnostics.delivery = {
        selectedIds: result.itemIds.length, detailsReturned: result.firstPage.length,
        deferredToLaterPages: result.itemIds.length - firstPageIds.length,
        detailsUnavailable: firstPageIds.length - result.firstPage.length
      };
    }

    res.status(200).json(result);
  } catch (err) {
    if (err instanceof ArticleSearchCursorError) {
      return res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          restartRequired: ['CURSOR_EXPIRED', 'CURSOR_QUERY_MISMATCH'].includes(err.code)
        }
      });
    }
    console.error("getArticles error:", err);
    res.status(500).json({ error: 'Unable to load articles' });
  }
};

// This function fetches duplicate articles belonging to one canonical article.
const getDuplicateArticles = async (req, res) => {
  try {
    const userId = req.userData.userId;
    const articleId = Number(req.params.articleId) || null;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!articleId) {
      return res.status(400).json({ error: 'articleId is required' });
    }

    const canonicalArticle = await Article.findOne({
      where: { id: articleId, userId, ...canonicalArticleWhere() },
      attributes: ['id']
    });

    if (!canonicalArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const articles = await Article.findAll({
      where: {
        userId,
        duplicateOfArticleId: articleId,
        filteredInd: false
      },
      include: [
        {
          model: Feed,
          required: true,
          attributes: ['id', 'feedName', 'categoryId', 'url', 'favicon']
        },
        {
          model: Tag,
          required: false,
          attributes: ['id', 'name', 'tagType']
        }
      ],
      order: [['publishedAt', 'DESC']]
    });

    return res.status(200).json({ articles });
  } catch (err) {
    console.error('Error in getDuplicateArticles:', err);
    return res.status(500).json({ error: 'Unable to load duplicate articles' });
  }
};

// Get single article details by ID
const getArticle = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const articleId = req.params.articleId;

    const article = await Article.findOne({
      where: {
        id: articleId,
        userId: userId,
        ...canonicalArticleWhere()
      },
      include: [
        {
          model: Feed,
          required: true,
          attributes: [
            'id',
            'feedName',
            'url',
            'categoryId',
            'feedTrust',
            'feedDuplicationRate',
            'feedAttentionAvg',
            'feedDeepReadRatio',
            'feedSkimRatio',
            'feedIgnoreRatio',
            'feedClickAvg',
            'feedClickRatio',
            'feedAttentionSampleSize'
          ]
        },
        {
          model: Tag,
          required: false,
          attributes: ['id', 'name', 'tagType']
        }
      ]
    });

    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    if (req.query.diagnostics === 'true') {
      const { results } = await explainArticleInterests(userId, [article]);
      const current = results.get(String(article.id));
      article.setDataValue('interestDiagnostics', { ...current,
        storedScore: Number(article.interestScore), scoredAt: article.interestScoredAt,
        matchesStoredScore: Math.abs(current.score - Number(article.interestScore)) <= 0.00015,
        evidenceAsOf: new Date().toISOString() });
    }
    await refreshExpiredArticleInterests(userId, [article]);
    res.status(200).json({ article: article });
  } catch (err) {
    console.error("Error in getArticle:", err);
    return res.status(500).json({ error: 'Unable to load article' });
  }
};

// This function returns recent semantic recommendations for one owned canonical article.
const getArticleRecommendations = async (req, res, _next) => {
  const userId = req.userData?.userId;
  const articleId = Number(req.params.articleId);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    return res.status(400).json({ error: 'Invalid articleId' });
  }

  try {
    const result = await getArticleRecommendationsService({ userId, articleId });
    if (!result) {
      return res.status(404).json({ error: 'Article not found' });
    }

    return res.status(200).json({
      sourceArticleId: result.sourceArticleId,
      articles: result.articles
    });
  } catch (err) {
    console.error('Error in getArticleRecommendations:', err);
    return res.status(500).json({ error: 'Unable to load article recommendations' });
  }
};

// This function returns the other visible articles belonging to one developing story.
const getDevelopingStoryArticles = async (req, res, _next) => {
  const userId = req.userData?.userId;
  const articleId = Number(req.params.articleId);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    return res.status(400).json({ error: 'Invalid articleId' });
  }

  try {
    const sourceArticle = await Article.findOne({
      where: { id: articleId, userId, ...canonicalArticleWhere() },
      attributes: ['id', 'status', 'eventId'],
      include: [{
        model: Event,
        as: 'event',
        required: false,
        where: { userId },
        attributes: [
          'id',
          'name',
          'generatedName',
          'representativeArticleId',
          'developingArticleId'
        ]
      }]
    });

    if (!sourceArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const sourceEvent = sourceArticle.get('event');
    const isDevelopingPointer = sourceEvent
      && Number(sourceEvent.developingArticleId) === Number(sourceArticle.id)
      && Number(sourceEvent.developingArticleId) !== Number(sourceEvent.representativeArticleId);
    if (!sourceArticle.eventId || !isDevelopingPointer) {
      return res.status(404).json({ error: 'Developing story not found' });
    }

    const relatedArticles = await Article.findAll({
      where: {
        eventId: sourceArticle.eventId,
        userId,
        id: { [Op.ne]: sourceArticle.id },
        ...canonicalArticleWhere()
      },
      attributes: ['id', 'title', 'url', 'publishedAt'],
      include: [{
        model: Feed,
        required: true,
        attributes: ['id', 'feedName', 'favicon']
      }],
      order: [['publishedAt', 'DESC'], ['id', 'DESC']],
      limit: RELATED_STORY_ARTICLE_LIMIT + 1,
      raw: true,
      nest: true
    });
    const hasMore = relatedArticles.length > RELATED_STORY_ARTICLE_LIMIT;

    return res.status(200).json({
      event: {
        id: sourceEvent.id,
        name: sourceEvent.name,
        generatedName: sourceEvent.generatedName
      },
      articles: relatedArticles
        .slice(0, RELATED_STORY_ARTICLE_LIMIT)
        .map(serializeRelatedStoryArticle),
      hasMore
    });
  } catch (err) {
    console.error('Error in getDevelopingStoryArticles:', err);
    return res.status(500).json({ error: 'Unable to load developing story articles' });
  }
};

// This function returns corroborating event articles published by other subscribed feeds.
const getStorySourceArticles = async (req, res, _next) => {
  const userId = req.userData?.userId;
  const articleId = Number(req.params.articleId);

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing userId' });
  }

  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    return res.status(400).json({ error: 'Invalid articleId' });
  }

  try {
    const sourceArticle = await Article.findOne({
      where: { id: articleId, userId, ...canonicalArticleWhere() },
      attributes: ['id', 'eventId', 'feedId'],
      include: [{
        model: Event,
        as: 'event',
        required: false,
        where: { userId },
        attributes: ['id', 'name', 'generatedName']
      }]
    });

    if (!sourceArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const sourceEvent = sourceArticle.get('event');
    if (!sourceArticle.eventId || !sourceEvent) {
      return res.status(404).json({ error: 'Story sources not found' });
    }

    const relatedArticles = await Article.findAll({
      where: {
        eventId: sourceArticle.eventId,
        userId,
        id: { [Op.ne]: sourceArticle.id },
        feedId: { [Op.ne]: sourceArticle.feedId },
        ...canonicalArticleWhere()
      },
      attributes: ['id', 'title', 'url', 'publishedAt'],
      include: [{
        model: Feed,
        required: true,
        attributes: ['id', 'feedName', 'favicon']
      }],
      order: [['publishedAt', 'DESC'], ['id', 'DESC']],
      limit: RELATED_STORY_ARTICLE_LIMIT + 1,
      raw: true,
      nest: true
    });
    const hasMore = relatedArticles.length > RELATED_STORY_ARTICLE_LIMIT;

    return res.status(200).json({
      event: {
        id: sourceEvent.id,
        name: sourceEvent.name,
        generatedName: sourceEvent.generatedName
      },
      articles: relatedArticles
        .slice(0, RELATED_STORY_ARTICLE_LIMIT)
        .map(serializeRelatedStoryArticle),
      hasMore
    });
  } catch (err) {
    console.error('Error in getStorySourceArticles:', err);
    return res.status(500).json({ error: 'Unable to load story source articles' });
  }
};

// Mark unread articles as read
const markAsRead = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const body = req.body || {};
    const statusGrouping = normalizeGrouping(body.grouping);
    const articleIds = Array.isArray(body.articleIds)
      ? body.articleIds
      : String(body.articleIds || '').split(',').filter(Boolean);
    const hasSnapshotArticleIds = Object.prototype.hasOwnProperty.call(
      body,
      'snapshotArticleIds'
    );
    const snapshotArticleIds = Array.isArray(body.snapshotArticleIds)
      ? body.snapshotArticleIds
      : String(body.snapshotArticleIds || '').split(',').filter(Boolean);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const readAt = new Date();

    if (articleIds.length > 0) {
      const selectedArticles = await Article.findAll({
        where: {
          id: { [Op.in]: articleIds },
          userId: userId,
          ...canonicalArticleWhere()
        },
        attributes: ['id', 'eventId']
      });

      const selectedEventIds = statusGrouping === 'event'
        ? [...new Set(selectedArticles.map(article => article.eventId).filter(Boolean))]
        : [];
      const articles = await Article.findAll({
        where: {
          userId,
          ...canonicalArticleWhere(),
          status: 'unread',
          ...(selectedEventIds.length > 0
            ? {
                [Op.or]: [
                  { id: { [Op.in]: articleIds } },
                  { eventId: { [Op.in]: selectedEventIds } }
                ]
              }
            : {
                id: { [Op.in]: articleIds }
              })
        },
        include: [{ model: Feed, required: true }]
      });

      if (!articles.length) {
        return res.status(200).json({
          message: "No unread articles to mark as read",
          articles: []
        });
      }

      const updatedArticles = await Promise.all(
        articles.map(article => retryDatabaseWrite(
          () => article.update({ status: "read", readAt })
        ))
      );

      return res.status(200).json({
        message: "Articles marked as read",
        articles: updatedArticles
      });
    }

    const {
      search = '',
      categoryId = '%',
      feedId = '%',
      minAdvertisementScore = 0,
      minSentimentScore = 0,
      minQualityScore = 0,
      sort = 'desc',
      tag = null,
      viewMode = 'full',
      grouping = statusGrouping
    } = body;

    const normalizedGrouping = normalizeGrouping(grouping);
    const publishedAfter = parsePublicationBound(body.publishedAfter, 'publishedAfter');
    const publishedBefore = parsePublicationBound(body.publishedBefore, 'publishedBefore');
    const toScoreThreshold = value => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : 0;
    };

    if (
      body.scope === 'matching'
      && !hasSnapshotArticleIds
      && cursorCompatibleScope({ sort, search })
    ) {
      let cursor = null;
      let matchedCount = 0;
      let updatedCount = 0;
      let expandedEventCount = 0;

      try {
        do {
          const result = await searchArticles({
            userId,
            search: search ? String(search) : '',
            categoryId: categoryId ?? '%',
            feedId: feedId ?? '%',
            status: 'unread',
            minAdvertisementScore: toScoreThreshold(minAdvertisementScore),
            minSentimentScore: toScoreThreshold(minSentimentScore),
            minQualityScore: toScoreThreshold(minQualityScore),
            sort: sort || 'desc',
            tag,
            viewMode,
            grouping: normalizedGrouping,
            publishedAfter,
            publishedBefore,
            persistSettings: false,
            pagination: { pageSize: 100, cursor }
          });
          const itemIds = result.page.itemIds;
          matchedCount += itemIds.length;
          const pageUpdate = await markScopedArticlePageAsRead({
            userId,
            itemIds,
            grouping: normalizedGrouping,
            readAt
          });
          updatedCount += pageUpdate.updatedCount;
          expandedEventCount += pageUpdate.expandedEventCount;
          cursor = result.page.hasMore ? result.page.nextCursor : null;
        } while (cursor);

        return res.status(200).json({
          message: matchedCount ? 'Articles marked as read' : 'No unread articles to mark as read',
          updatedCount,
          matchedCount,
          expandedEventCount
        });
      } catch (error) {
        if (!(error instanceof ArticleSearchCursorError) || error.code !== 'CURSOR_SORT_UNSUPPORTED') {
          throw error;
        }
      }
    }

    let liveItemIds = [];
    if (!hasSnapshotArticleIds) {
      const result = await searchArticles({
        userId,
        search: search ? String(search) : '',
        categoryId: categoryId ?? '%',
        feedId: feedId ?? '%',
        status: 'unread',
        minAdvertisementScore: toScoreThreshold(minAdvertisementScore),
        minSentimentScore: toScoreThreshold(minSentimentScore),
        minQualityScore: toScoreThreshold(minQualityScore),
        sort: sort || 'desc',
        tag,
        viewMode,
        grouping: normalizedGrouping,
        publishedAfter,
        publishedBefore,
        persistSettings: false
      });
      liveItemIds = result.itemIds || [];
    }

    // Treats a supplied list snapshot as the complete selection scope.
    const itemIds = [
      ...new Map(
        (hasSnapshotArticleIds ? snapshotArticleIds : liveItemIds)
          .map(id => [String(id), id])
      ).values()
    ];

    if (itemIds.length === 0) {
      return res.status(200).json({
        message: 'No unread articles to mark as read',
        updatedCount: 0,
        matchedCount: 0,
        expandedEventCount: 0
      });
    }

    let eventIds = [];

    if (normalizedGrouping === 'event') {
      const selectedArticles = await Article.findAll({
        where: {
          id: { [Op.in]: itemIds },
          userId,
          ...canonicalArticleWhere()
        },
        attributes: ['id', 'eventId']
      });

      eventIds = [
        ...new Set(
          selectedArticles
            .map(article => article.eventId)
            .filter(eventId => eventId !== null && eventId !== undefined)
        )
      ];
    }

    const updateWhere = {
      userId,
      ...canonicalArticleWhere(),
      status: 'unread',
      ...(eventIds.length > 0
        ? {
            [Op.or]: [
              { id: { [Op.in]: itemIds } },
              { eventId: { [Op.in]: eventIds } }
            ]
          }
        : {
            id: { [Op.in]: itemIds }
          })
    };

    const [updatedCount] = await retryDatabaseWrite(() => Article.update(
      { status: 'read', readAt },
      { where: updateWhere }
    ));

    return res.status(200).json({
      message: 'Articles marked as read',
      updatedCount,
      matchedCount: itemIds.length,
      expandedEventCount: eventIds.length
    });
  } catch (err) {
    if (err instanceof ArticleSearchCursorError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    console.error("Error in markAsRead:", err);
    return res.status(500).json({ error: 'Unable to mark articles as read' });
  }
};

// Mark article as clicked
const incrementArticleClickCount = async article => {
  await updateArticleBehavior(Article, { clickedAmount: db.sequelize.literal('clickedAmount + 1'), lastClickedAt: new Date() }, {
    where: { id: article.id, userId: article.userId, ...canonicalArticleWhere() }
  });
  return article.reload();
};

const markClicked = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;
    const update = req.body?.update;
    const requestedArticleIds = req.body?.articleIds;
    const articleIds = Array.isArray(requestedArticleIds)
      ? requestedArticleIds
      : String(requestedArticleIds || '').split(',').filter(Boolean);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!articleId && articleIds.length > 0) {
      const articles = await Article.findAll({
        where: {
          id: { [Op.in]: articleIds },
          userId: userId,
          ...canonicalArticleWhere()
        }
      });

      if (!articles.length) {
        return res.status(404).json({ error: "Articles not found" });
      }

      const updatedArticles = await Promise.all(
        articles.map(incrementArticleClickCount)
      );

      return res.status(200).json({
        message: "Articles marked as clicked",
        articles: updatedArticles.map(article => ({
          id: article.id,
          clickedAmount: article.clickedAmount
        }))
      });
    }

    if (!articleId) {
      return res.status(400).json({ error: "articleId is required" });
    }

    if (update !== undefined && !['mark', 'unmark'].includes(update)) {
      return res.status(400).json({ error: "update must be mark or unmark" });
    }

    const article = await Article.findOne({
      where: {
        id: articleId,
        userId: userId,
        ...canonicalArticleWhere()
      }
    });

    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    if (update) {
      const clickedAmount = update === 'mark'
        ? Math.max(Number(article.clickedAmount) || 0, 1)
        : 0;
      await updateArticleBehavior(article, { clickedAmount, lastClickedAt: update === 'mark' ? new Date() : null });
    } else {
      await incrementArticleClickCount(article);
    }

    res.status(200).json({ 
      message: update === 'unmark' ? "Article unmarked as clicked" : "Article marked as clicked",
      articleId: articleId,
      clickedAmount: article.clickedAmount
    });
  } catch (err) {
    console.error("Error in markClicked:", err);
    return res.status(500).json({ error: 'Unable to mark article as clicked' });
  }
};

// Mark article as not interested
const markNotInterested = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!articleId) {
      return res.status(400).json({ error: "articleId is required" });
    }

    const article = await Article.findOne({
      where: {
        id: articleId,
        userId: userId,
        ...canonicalArticleWhere()
      }
    });

    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    // Write both flags atomically, including unchanged values, so concurrent feedback cannot conflict.
    await updateArticleBehavior(Article, { negativeInd: 1, positiveInd: 0, negativeFeedbackAt: new Date(), positiveFeedbackAt: null }, {
      where: { id: article.id, userId, ...canonicalArticleWhere() }
    });

    res.status(200).json({ 
      message: "Article marked as not interested",
      articleId: articleId
    });
  } catch (err) {
    console.error("Error in markNotInterested:", err);
    return res.status(500).json({ error: 'Unable to mark article as not interested' });
  }
};

// Mark article as a positive recommendation signal
const markMoreLikeThis = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!articleId) {
      return res.status(400).json({ error: "articleId is required" });
    }

    const article = await Article.findOne({
      where: {
        id: articleId,
        userId: userId,
        ...canonicalArticleWhere()
      }
    });

    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    // Write both flags atomically, including unchanged values, so concurrent feedback cannot conflict.
    await updateArticleBehavior(Article, {
      positiveInd: 1,
      negativeInd: 0,
      positiveFeedbackAt: new Date(),
      negativeFeedbackAt: null
    }, {
      where: { id: article.id, userId, ...canonicalArticleWhere() }
    });

    res.status(200).json({
      message: "Article marked as more like this",
      articleId: articleId
    });
  } catch (err) {
    console.error("Error in markMoreLikeThis:", err);
    return res.status(500).json({ error: 'Unable to mark article as more like this' });
  }
};

// Get multiple article details by IDs
const articleDetails = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const articleIds = req.body.articleIds;

    if (articleIds === undefined) {
      return res.status(400).json({
        message: "articleIds is not set"
      });
    }

    const articlesArray = articleIds.split(",");
    const articles = await loadArticleDetails(userId, articlesArray);

    if (!articles) {
      return res.status(404).json({
        message: "No articles found"
      });
    }

    return res.status(200).json(articles);
  } catch (err) {
    console.error('Error in articleDetails:', err);
    return res.status(500).json({ error: 'Unable to load article details' });
  }
};

// Helper function to update article status
const updateArticleStatus = async (userId, articleId, status) => {
  try {

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    if (!articleId) {
      return res.status(400).json({ error: "articleId is required" });
    }

    const article = await Article.findOne({
      where: {
        id: articleId,
        userId: userId,
        ...canonicalArticleWhere()
      },
      include: [{
        model: Feed,
        required: true
      }]
    });

    if (!article) {
      return { success: false, statusCode: 404, message: "Article not found" };
    }

    await article.update({
      status,
      readAt: status === 'read' ? new Date() : null
    });
    return { success: true, statusCode: 200, article: article };
  } catch (error) {
    return { success: false, statusCode: 400, error: error };
  }
};

// Capture contract: visibleSeconds should contain eligible readable-content time,
// not headline exposure, hidden-tab time or time inferred from a read-state action.
// The frontend caps eligible intervals at its inactivity deadline and excludes hidden time.
// Compute the attention estimate from the submitted seconds and content length.
const attentionBucketFromSeconds = (visibleSeconds, wordCount) => {
  if (!visibleSeconds || visibleSeconds <= 0 || wordCount <= 0) {
    return 0; // no sufficient recorded attention; exposure may be unknown
  }

  // Expected reading time (seconds)
  // 200 wpm average, clamped
  const expectedSeconds = Math.max(
    15,
    Math.min(300, (wordCount / 200) * 60)
  );

  const ratio = visibleSeconds / expectedSeconds;

  // Map ratio → bucket (0–4)
  if (ratio < 0.05) return 0; // passed
  if (ratio < 0.25) return 1; // skimmed
  if (ratio < 0.75) return 2; // read
  if (ratio < 1.25) return 3; // deep read
  return 4; // highly engaged
};

// Mark article as seen
const articleMarkAsSeen = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;
    const selectedStatus = req.body?.selectedStatus || "read";
    const visibleSeconds = Number(req.body?.visibleSeconds ?? 0);
    const readingWordCount = req.body?.readingWordCount;
    for (const key of ['markRead', 'recordObservation']) {
      if (req.body?.[key] !== undefined && typeof req.body[key] !== 'boolean') {
        return res.status(400).json({ error: `${key} must be a boolean` });
      }
    }
    if (!Number.isFinite(visibleSeconds) || visibleSeconds < 0
      || (readingWordCount !== undefined && (!Number.isInteger(readingWordCount)
        || readingWordCount < 0 || readingWordCount > 1000000))) {
      return res.status(400).json({ error: 'Invalid reading measurement' });
    }
    // Explicit flags separate evidence from state. Retain legacy selectedStatus callers,
    // but a legacy zero-second mark-read is also a state-only action.
    const markRead = req.body?.markRead ?? selectedStatus === 'unread';
    const recordObservation = req.body?.recordObservation ?? (!markRead || visibleSeconds > 0);

    // Validate userId
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    // Fetch article and feed details (needed for updating the categories read and unread counts on the frontend)
    const article = await Article.findOne({
      where: {
        id: articleId,
        userId,
        ...canonicalArticleWhere()
      },
      include: [
        {
          model: Feed,
          required: true
        },
        {
          model: Event,
          as: 'event',
          required: false,
          attributes: ['id', 'articleCount']
        }
      ]
    });

    // Validate article existence
    if (!article) {
      return res.status(404).json({ error: 'Error: article not found' });
    }

    // Modern clients count normalized rendered text, including previews and summaries.
    // Older clients use the canonical body text or the existing HTML-to-text normalizer.
    const normalizedText = recordObservation && visibleSeconds > 0 && readingWordCount === undefined
      ? String(article.contentText || htmlToVisibleText(article.contentHtml || article.content || article.descriptionHtml || '') || article.description || '').trim()
      : '';
    const wordCount = readingWordCount ?? (normalizedText ? normalizedText.split(/\s+/u).length : 0);
    const attentionBucket = recordObservation ? attentionBucketFromSeconds(visibleSeconds, wordCount) : 0;

    // Start with empty payload
    const payload = {};

    // Preserve firstSeen while allowing later, stronger attention evidence.
    // Explicit read actions and Event siblings do not acquire exposure evidence.
    if (recordObservation && !article.firstSeen) {
      payload.firstSeen = new Date();
    }
    if (attentionBucket > article.attentionBucket) {
      // Compare in SQL too so an overlapping weaker observation cannot undo an upgrade.
      payload.attentionBucket = db.sequelize.literal(
        `CASE WHEN attentionBucket < ${attentionBucket} THEN ${attentionBucket} ELSE attentionBucket END`
      );
    }

    // Only an observed deep read refreshes behavioral time; a read-state toggle does not.
    if (attentionBucket >= 3) payload.lastMeaningfulReadAt = new Date();

    // Mark article as read only when it was unread before.
    let shouldMarkRead = false;
    const readArticles = [];
    if (markRead) {
      payload.status = 'read';
      payload.readAt = new Date();
      shouldMarkRead = true;
      if (article.status === 'unread') {
        readArticles.push({
          id: Number(article.id),
          feedId: article.feedId,
          feed: article.feed
        });
      }
    }

    // Only update if payload has any changes; return updated instance
    let updatedArticle = article;
    if (Object.keys(payload).length > 0) {
      updatedArticle = await retryDatabaseWrite(() => updateArticleBehavior(article, payload));
      if (payload.attentionBucket) await updatedArticle.reload();
    }

    // Prepare response object
    const response = updatedArticle.toJSON();

    // Only add eventArticleCount when:
    // - unread → read transition
    // - AND article actually has an event loaded
    if (
      markRead &&
      updatedArticle.eventId &&
      response.event &&
      Number.isInteger(response.event.articleCount)
    ) {
      response.eventArticleCount = response.event.articleCount;
    }

    // Group navigation may mark siblings read, but attention belongs only to the viewed article.
    const grouping = normalizeGrouping(req.body?.grouping);

    if (grouping === 'event' && article.eventId && shouldMarkRead) {
      console.log(`${grouping} grouping enabled: marking related articles for event ${article.eventId} as seen`);

      const eventPayload = { status: 'read', readAt: payload.readAt };
      const relatedEventIds = [article.eventId];

      const eventWhere = {
        id: { [Op.ne]: articleId },
        userId: userId,
        ...canonicalArticleWhere(),
        eventId: { [Op.in]: relatedEventIds }
      };

      if (shouldMarkRead) {
        const unreadEventArticles = await Article.findAll({
          where: {
            ...eventWhere,
            status: 'unread'
          },
          attributes: ['id', 'feedId'],
          include: [{
            model: Feed,
            required: true,
            attributes: ['id', 'categoryId']
          }]
        });
        readArticles.push(
          ...unreadEventArticles.map(eventArticle => ({
            id: Number(eventArticle.id),
            feedId: eventArticle.feedId,
            feed: eventArticle.feed
          }))
        );
      }

      await retryDatabaseWrite(() => Article.update(eventPayload, {
        where: eventWhere
      }));
    }

    if (shouldMarkRead) {
      const dedupedReadArticles = new Map();
      for (const readArticle of readArticles) {
        dedupedReadArticles.set(readArticle.id, readArticle);
      }
      response.readArticles = [...dedupedReadArticles.values()];
      response.readArticleIds = response.readArticles.map(readArticle => readArticle.id);
    }

    // Return updated article instance (reflects any changes)
    return res.status(200).json(response);

  } catch (err) {
    console.error('Error in articleMarkAsRead:', err);
    return res.status(500).json({ error: 'Unable to mark article as read' });
  }
};

// Mark article as unread
const articleMarkToUnread = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const result = await updateArticleStatus(userId, articleId, "unread");

    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message || "Error updating article"
      });
    }

    return res.status(result.statusCode).json(result.article);
  } catch (err) {
    console.error('Error in articleMarkToUnread:', err);
    return res.status(500).json({ error: 'Unable to mark article as unread' });
  }
};

// Mark article as favorite
const articleMarkAsFavorite = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;
    const update = req.body.update;
    const articleIds = Array.isArray(req.body.articleIds)
      ? req.body.articleIds
      : String(req.body.articleIds || '').split(',').filter(Boolean);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (update === undefined) {
      return res.status(400).json({
        message: "Favorite indicator is not set"
      });
    }

    const favoriteInd = update === "mark" ? 1 : 0;

    if (!articleId && articleIds.length > 0) {
      const articles = await Article.findAll({
        where: {
          id: { [Op.in]: articleIds },
          userId: userId,
          ...canonicalArticleWhere()
        },
        include: [{
          model: Feed,
          required: true
        }]
      });

      if (!articles.length) {
        return res.status(404).json({
          message: "Articles not found"
        });
      }

      await Promise.all(articles.map(article => updateArticleBehavior(article, { favoriteInd, favoritedAt: favoriteInd ? new Date() : null })));
      return res.status(200).json({ articles });
    }

    if (!articleId) {
      return res.status(400).json({
        message: "articleId or articleIds is required"
      });
    }

    const article = await Article.findOne({
      where: {
        id: articleId,
        userId: userId,
        ...canonicalArticleWhere()
      },
      include: [{
        model: Feed,
        required: true
      }]
    });

    if (!article) {
      return res.status(404).json({
        message: "Article not found"
      });
    }
    await updateArticleBehavior(article, { favoriteInd, favoritedAt: favoriteInd ? new Date() : null });
    return res.status(200).json(article);
  } catch (err) {
    console.error('Error in articleMarkAsFavorite:', err);
    return res.status(500).json({ error: 'Unable to update article favorite status' });
  }
};

// Mark all articles as read
const articleMarkAllAsRead = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    await retryDatabaseWrite(() => Article.update({
      status: "read",
      readAt: new Date()
    }, {
      where: {
        status: "unread",
        userId: userId,
        ...canonicalArticleWhere()
      }
    }));

    return res.status(200).json("marked all as read");
  } catch (err) {
    console.error('Error in articleMarkAllAsRead:', err);
    return res.status(500).json({ error: 'Unable to mark all articles as read' });
  }
};

export default {
  getDailyBriefing,
  getArticles,
  getDuplicateArticles,
  getArticle,
  getArticleRecommendations,
  getDevelopingStoryArticles,
  getStorySourceArticles,
  markAsRead,
  markClicked,
  markNotInterested,
  markMoreLikeThis,
  articleDetails,
  articleMarkAsSeen,
  articleMarkToUnread,
  articleMarkAsFavorite,
  articleMarkAllAsRead
}
