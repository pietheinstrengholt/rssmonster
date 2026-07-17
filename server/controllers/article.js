import db from '../models/index.js';
const { Article, Feed, Tag, Event } = db;
import { Op, fn, col } from 'sequelize';
import { searchArticles } from "../services/articleSearch/articleSearch.service.js";
import { resolvePredictedAffinity } from '../services/recommendations/predictedAffinityResolver.js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';

// This function normalizes article grouping values used by API consumers.
const normalizeGrouping = value => (value === 'event' || value === 'topic' ? value : 'none');

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
const loadArticleDetails = async (userId, articlesArray) => {
  const articles = await Article.findAll({
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
      },
      {
        model: Event,
        as: 'cluster',
        required: false,
        attributes: ['id', 'articleCount', 'sourceCount', 'topicId']
      }
    ],
    where: { userId, id: articlesArray, ...canonicalArticleWhere() }
  });

  // Compute topic-level article counts in one grouped query for topic grouping badges.
  const topicIds = [...new Set(articles.map(article => article.cluster?.topicId).filter(Boolean))];
  if (topicIds.length > 0) {
    const topicRows = await Event.findAll({
      where: { userId, topicId: { [Op.in]: topicIds } },
      attributes: ['topicId', [fn('SUM', col('articleCount')), 'topicArticleCount']],
      group: ['topicId'],
      raw: true
    });
    const topicCountMap = new Map(topicRows.map(row => [row.topicId, Number(row.topicArticleCount) || 0]));

    for (const article of articles) {
      if (article.cluster?.topicId) {
        article.cluster.setDataValue(
          'topicArticleCount',
          topicCountMap.get(article.cluster.topicId) ?? article.cluster.articleCount ?? 0
        );
      }
    }
  }

  // Preserve incoming ID order
  const idIndexMap = new Map(articlesArray.map((id, i) => [String(id), i]));
  articles.sort((a, b) => idIndexMap.get(String(a.id)) - idIndexMap.get(String(b.id)));

  attachPredictedAffinity(articles);

  return articles;
};

export const getArticles = async (req, res) => {
  try {
    const userId = req.userData.userId;
    const result = await searchArticles({
      userId,
      search: req.query.search || "",
      categoryId: req.query.categoryId,
      feedId: req.query.feedId,
      status: req.query.status,
      minAdvertisementScore: req.query.minAdvertisementScore,
      minSentimentScore: req.query.minSentimentScore,
      minQualityScore: req.query.minQualityScore,
      sort: req.query.sort,
      tag: req.query.tag,
      viewMode: req.query.viewMode,
      grouping: req.query.grouping || 'none',
      persistSettings: true
    });

    if (req.query.includeFirstPage === 'true' && result.itemIds.length > 0) {
      const pageSize = req.query.viewMode === 'minimal' ? 50 : 20;
      const firstPageIds = result.itemIds.slice(0, pageSize);
      result.firstPage = await loadArticleDetails(userId, firstPageIds);
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("getArticles error:", err);
    res.status(500).json({ error: err.message });
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
    return res.status(500).json({ error: err.message });
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

    res.status(200).json({ article: article });
  } catch (err) {
    console.error("Error in getArticle:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Mark unread articles as read
const markAsRead = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const body = req.body || {};
    const articleIds = Array.isArray(body.articleIds)
      ? body.articleIds
      : String(body.articleIds || '').split(',').filter(Boolean);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (articleIds.length > 0) {
      const articles = await Article.findAll({
        where: {
          id: { [Op.in]: articleIds },
          userId: userId,
          ...canonicalArticleWhere(),
          status: "unread"
        },
        include: [{
          model: Feed,
          required: true
        }]
      });

      if (!articles.length) {
        return res.status(200).json({
          message: "No unread articles to mark as read",
          articles: []
        });
      }

      const updatedArticles = await Promise.all(
        articles.map(article => article.update({ status: "read" }))
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
      grouping = body.grouping ?? 'none'
    } = body;

    const normalizedGrouping = normalizeGrouping(grouping);
    const toScoreThreshold = value => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : 0;
    };

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
      persistSettings: false
    });

    const itemIds = result.itemIds || [];

    if (itemIds.length === 0) {
      return res.status(200).json({
        message: 'No unread articles to mark as read',
        updatedCount: 0,
        matchedCount: 0,
        expandedEventCount: 0
      });
    }

    let eventIds = [];

    if (normalizedGrouping === 'event' || normalizedGrouping === 'topic') {
      const selectedArticles = await Article.findAll({
        where: {
          id: { [Op.in]: itemIds },
          userId,
          ...canonicalArticleWhere()
        },
        attributes: ['id', 'eventId'],
        include: [{
          model: Event,
          as: 'cluster',
          required: false,
          attributes: ['topicId']
        }]
      });

      if (normalizedGrouping === 'topic') {
        const topicIds = [
          ...new Set(
            selectedArticles
              .map(article => article.cluster?.topicId)
              .filter(topicId => topicId !== null && topicId !== undefined)
          )
        ];

        if (topicIds.length > 0) {
          const topicEvents = await Event.findAll({
            where: {
              userId,
              topicId: { [Op.in]: topicIds }
            },
            attributes: ['id']
          });

          eventIds = topicEvents.map(event => event.id);
        }
      } else {
        eventIds = [
          ...new Set(
            selectedArticles
              .map(article => article.eventId)
              .filter(eventId => eventId !== null && eventId !== undefined)
          )
        ];
      }
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

    const [updatedCount] = await Article.update(
      { status: 'read' },
      { where: updateWhere }
    );

    return res.status(200).json({
      message: 'Articles marked as read',
      updatedCount,
      matchedCount: itemIds.length,
      expandedEventCount: eventIds.length
    });
  } catch (err) {
    console.error("Error in markAsRead:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Mark article as clicked
const markClicked = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;
    const articleIds = Array.isArray(req.body.articleIds)
      ? req.body.articleIds
      : String(req.body.articleIds || '').split(',').filter(Boolean);

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

      const updatedArticles = await Promise.all(articles.map(article => {
        const currentClicked = article.clickedAmount || 0;
        return article.update({ clickedAmount: currentClicked + 1 });
      }));

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

    const currentClicked = article.clickedAmount || 0;
    await article.update({ clickedAmount: currentClicked + 1 });

    res.status(200).json({ 
      message: "Article marked as clicked",
      articleId: articleId
    });
  } catch (err) {
    console.error("Error in markClicked:", err);
    return res.status(500).json({ error: err.message });
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

    await article.update({ negativeInd: 1 });

    res.status(200).json({ 
      message: "Article marked as not interested",
      articleId: articleId
    });
  } catch (err) {
    console.error("Error in markNotInterested:", err);
    return res.status(500).json({ error: err.message });
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

    await article.update({
      positiveInd: 1,
      negativeInd: 0
    });

    res.status(200).json({
      message: "Article marked as more like this",
      articleId: articleId
    });
  } catch (err) {
    console.error("Error in markMoreLikeThis:", err);
    return res.status(500).json({ error: err.message });
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
    console.log(err);
    return res.status(500).json(err);
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

    await article.update({ status: status });
    return { success: true, statusCode: 200, article: article };
  } catch (error) {
    return { success: false, statusCode: 400, error: error };
  }
};

// Compute attention bucket based on visible seconds and content length
const attentionBucketFromSeconds = (visibleSeconds, contentHtml) => {
  if (!visibleSeconds || visibleSeconds <= 0) {
    return 0; // not read
  }

  // Word count from stripped content
  const wordCount = contentHtml
    ? contentHtml.trim().split(/\s+/).length
    : 0;

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
          as: 'cluster',
          required: false,
          attributes: ['id', 'articleCount']
        }
      ]
    });

    // Validate article existence
    if (!article) {
      return res.status(404).json({ error: 'Error: article not found' });
    }

    // Extract visibleSeconds from request (optional)
    const visibleSeconds = Number(req.body?.visibleSeconds) || 0;

    // Compute attention bucket
    const attentionBucket = attentionBucketFromSeconds(
      visibleSeconds,
      article.contentHtml
    );

    // Start with empty payload
    const payload = {};

    // Only set firstSeen and attentionBucket if the article does not have firstSeen yet
    if (!article.firstSeen) {
      payload.firstSeen = new Date();
      payload.attentionBucket = attentionBucket;
    }

    // Mark article as read only when it was unread before.
    let shouldMarkRead = false;
    const readArticles = [];
    if (selectedStatus === 'unread') {
      payload.status = 'read';
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
      updatedArticle = await article.update(payload);
    }

    // Prepare response object
    const response = updatedArticle.toJSON();

    // Only add clusterCount when:
    // - unread → read transition
    // - AND article actually has a cluster loaded
    if (
      selectedStatus === 'unread' &&
      updatedArticle.eventId &&
      response.cluster &&
      Number.isInteger(response.cluster.articleCount)
    ) {
      response.clusterCount = response.cluster.articleCount;
    }

    // If event grouping is enabled and article has an eventId, update all articles in the same event using the same payload.
    const grouping = normalizeGrouping(req.body?.grouping);

    if ((grouping === 'event' || grouping === 'topic') && article.eventId) {
      console.log(`${grouping} grouping enabled: marking related articles for event ${article.eventId} as seen`);

      // Exclude the firstSeen and overwrite it again for the whole cluster. The parent is leading
      // If status should be marked as read, ensure it is set for the cluster update as well
      const clusterPayload = { ...payload };
      if (shouldMarkRead) {
        clusterPayload.status = 'read';
      } else {
        // Remove status if not updating
        delete clusterPayload.status;
      }
      let relatedEventIds = [article.eventId];

      if (grouping === 'topic') {
        const cluster = await Event.findOne({
          where: {
            id: article.eventId,
            userId
          },
          attributes: ['topicId']
        });

        if (cluster?.topicId) {
          const topicEvents = await Event.findAll({
            where: {
              userId,
              topicId: cluster.topicId
            },
            attributes: ['id']
          });
          relatedEventIds = topicEvents.map(event => event.id);
        }
      }

      const clusterWhere = {
        id: { [Op.ne]: articleId },
        userId: userId,
        ...canonicalArticleWhere(),
        eventId: { [Op.in]: relatedEventIds }
      };

      if (shouldMarkRead) {
        const unreadClusterArticles = await Article.findAll({
          where: {
            ...clusterWhere,
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
          ...unreadClusterArticles.map(clusterArticle => ({
            id: Number(clusterArticle.id),
            feedId: clusterArticle.feedId,
            feed: clusterArticle.feed
          }))
        );
      }

      await Article.update(clusterPayload, {
        where: clusterWhere
      });
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
    console.log(err);
    return res.status(500).json(err);
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
    console.log(err);
    return res.status(500).json(err);
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

      await Promise.all(articles.map(article => article.update({ favoriteInd })));
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
    await article.update({ favoriteInd });
    return res.status(200).json(article);
  } catch (err) {
    console.error('Error in articleMarkAsFavorite:', err);
    return res.status(500).json(err);
  }
};

// Mark all articles as read
const articleMarkAllAsRead = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    await Article.update({
      status: "read"
    }, {
      where: {
        status: "unread",
        userId: userId,
        ...canonicalArticleWhere()
      }
    });

    return res.status(200).json("marked all as read");
  } catch (err) {
    console.log(err);
  }
};

export default {
  getArticles,
  getDuplicateArticles,
  getArticle,
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
