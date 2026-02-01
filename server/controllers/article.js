import db from '../models/index.js';
const { Article, Feed, Tag, ArticleCluster } = db;
import { Op } from 'sequelize';
import { searchArticles } from "../util/articleSearch.service.js";

export const getArticles = async (req, res) => {
  try {
    const result = await searchArticles({
      userId: req.userData.userId,
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
      clusterView: req.query.clusterView === "true",
      persistSettings: true
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("getArticles error:", err);
    res.status(500).json({ error: err.message });
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
    
    const article = await Article.findByPk(articleId, {
      where: { userId: userId },
      include: [
        {
          model: Feed,
          required: true
        },
        {
          model: Tag,
          required: false,
          attributes: ['id', 'name']
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

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const categoryId = req.body.categoryId || "%";
    const feedId = req.body.feedId || "%";
    const minAdvertisementScore = req.body.minAdvertisementScore != null ? parseInt(req.body.minAdvertisementScore) : 0;
    const minSentimentScore = req.body.minSentimentScore != null ? parseInt(req.body.minSentimentScore) : 0;
    const minQualityScore = req.body.minQualityScore != null ? parseInt(req.body.minQualityScore) : 0;

    // Build where clause based on currentSelection
    const whereClause = {
      userId: userId,
      status: "unread",
      advertisementScore: { [Op.gte]: minAdvertisementScore },
      sentimentScore: { [Op.gte]: minSentimentScore },
      qualityScore: { [Op.gte]: minQualityScore }
    };

    // Add categoryId filter if not "all"
    if (categoryId !== "%") {
      // Get feeds for this category
      const feeds = await Feed.findAll({
        attributes: ["id"],
        where: { 
          userId: userId,
          categoryId: categoryId
        }
      });
      const feedIds = feeds.map(feed => feed.id);
      whereClause.feedId = feedIds;
    }

    // Add feedId filter if specific feed selected
    if (feedId !== "%") {
      whereClause.feedId = feedId;
    }
    
    await Article.update(
      { status: "read" },
      { where: whereClause }
    );

    res.status(200).json({ message: "All articles marked as read" });
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

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    if (!articleId) {
      return res.status(400).json({ error: "articleId is required" });
    }

    const article = await Article.findOne({
      where: {
        id: articleId,
        userId: userId
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

// Mark article as opened
const markOpened = async (req, res, _next) => {
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
        userId: userId
      }
    });

    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    const currentOpened = article.openedCount || 0;
    await article.update({ openedCount: currentOpened + 1 });

    res.status(200).json({ 
      message: "Article marked as opened",
      articleId: articleId
    });
  } catch (err) {
    console.error("Error in markOpened:", err);
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
        userId: userId
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

// Get multiple article details by IDs
const articleDetails = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const articleIds = req.body.articleIds;
    const sort = req.body.sort || "DESC";

    if (articleIds === undefined) {
      return res.status(400).json({
        message: "articleIds is not set"
      });
    }

    const articlesArray = articleIds.split(",");
    console.log(`\x1b[33mFetching details for ${articlesArray.length} articles for user ${userId}\x1b[0m`);

    // Determine ordering strategy:
    // - IMPORTANCE/QUALITY/ATTENTION: preserve articleIds order (already sorted by search service)
    // - DESC/ASC: sort by published date
    // - Default: DESC
    const sortUpper = (sort || "").toUpperCase();
    const orderClause = ["IMPORTANCE", "QUALITY", "ATTENTION"].includes(sortUpper)
      ? [] // No database sorting - preserve ID array order from search service
      : [["published", sort || "DESC"]];

    const articles = await Article.findAll({
      include: [
        {
          model: Feed,
          required: true
        },
        {
          model: Tag,
          required: false,
          attributes: ['id', 'name']
        },
        {
          model: ArticleCluster,
          as: 'cluster',
          required: false
        },
      ],
      order: orderClause,
      where: {
        userId: userId,
        id: articlesArray
      }
    });

    if (!articles) {
      return res.status(404).json({
        message: "No articles found"
      });
    }
    
    // Preserve original ID order for IMPORTANCE/QUALITY/ATTENTION (search service already sorted)
    if (["IMPORTANCE", "QUALITY", "ATTENTION"].includes(sortUpper)) {
      const idIndexMap = new Map(articlesArray.map((id, index) => [String(id), index]));
      articles.sort((a, b) => idIndexMap.get(String(a.id)) - idIndexMap.get(String(b.id)));
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

    const article = await Article.findByPk(articleId, {
      where: {
        userId: userId
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
const attentionBucketFromSeconds = (visibleSeconds, contentStripped) => {
  if (!visibleSeconds || visibleSeconds <= 0) {
    return 0; // not read
  }

  // Word count from stripped content
  const wordCount = contentStripped
    ? contentStripped.trim().split(/\s+/).length
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
    const article = await Article.findByPk(articleId, {
      where: {
        userId
      },
      include: [
        {
          model: Feed,
          required: true
        },
        {
          model: ArticleCluster,
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
      article.contentStripped
    );

    // Start with empty payload
    const payload = {};

    // Only set firstSeen and attentionBucket if the article does not have firstSeen yet
    if (!article.firstSeen) {
      payload.firstSeen = new Date();
      payload.attentionBucket = attentionBucket;
    }

    // Mark article as read only when it was unread before
    let shouldMarkRead = false;
    if (selectedStatus === 'unread') {
      payload.status = 'read';
      shouldMarkRead = true;
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
      updatedArticle.clusterId &&
      response.cluster &&
      Number.isInteger(response.cluster.articleCount)
    ) {
      response.clusterCount = response.cluster.articleCount;
    }

    // Check if cluster view is enabled
    const clusterView = req.body?.clusterView === true || req.body?.clusterView === 'true';

    // If clusterView is enabled and article has a clusterId, update all articles in the same cluster using the same payload
    if (clusterView && article.clusterId) {
      console.log(`Cluster view enabled: marking all articles in cluster ${article.clusterId} as seen`);

      // Exclude the firstSeen and overwrite it again for the whole cluster. The parent is leading
      // If status should be marked as read, ensure it is set for the cluster update as well
      const clusterPayload = { ...payload };
      if (shouldMarkRead) {
        clusterPayload.status = 'read';
      } else {
        // Remove status if not updating
        delete clusterPayload.status;
      }
      await Article.update(clusterPayload, {
        where: {
          id: { [Op.ne]: articleId },
          userId: userId,
          clusterId: article.clusterId
        }
      });
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

// Mark article with star
const articleMarkWithStar = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;
    const update = req.body.update;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const article = await Article.findByPk(articleId, {
      where: {
        userId: userId
      },
      include: [{
        model: Feed,
        required: true
      }]
    });

    if (update === undefined) {
      return res.status(400).json({
        message: "Star indicator is not set"
      });
    }

    if (!article) {
      return res.status(404).json({
        message: "Article not found"
      });
    }
    
    const starInd = update === "mark" ? 1 : 0;
    article
      .update({ starInd }, { where: { userId: userId } })
      .then(() => res.status(200).json(article))
      .catch(error => res.status(400).json(error));
  } catch (err) {
    console.log(err);
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
        userId: userId
      }
    });

    return res.status(200).json("marked all as read");
  } catch (err) {
    console.log(err);
  }
};

export default {
  getArticles,
  getArticle,
  markAsRead,
  markClicked,
  markOpened,
  markNotInterested,
  articleDetails,
  articleMarkAsSeen,
  articleMarkToUnread,
  articleMarkWithStar,
  articleMarkAllAsRead
}