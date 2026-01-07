import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Tag from "../models/tag.js";
import { Op } from 'sequelize';
import { computeImportance } from '../util/importanceScore.js';
import ArticleCluster from "../models/articleCluster.js";
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
const getArticle = async (req, res, next) => {
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
const markAsRead = async (req, res, next) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const categoryId = req.body.categoryId || "%";
    const feedId = req.body.feedId || "%";
    const minAdvertisementScore = req.body.minAdvertisementScore != null ? parseInt(req.body.minAdvertisementScore) : 100;
    const minSentimentScore = req.body.minSentimentScore != null ? parseInt(req.body.minSentimentScore) : 100;
    const minQualityScore = req.body.minQualityScore != null ? parseInt(req.body.minQualityScore) : 100;

    // Build where clause based on currentSelection
    const whereClause = {
      userId: userId,
      status: "unread",
      advertisementScore: { [Op.lte]: minAdvertisementScore },
      sentimentScore: { [Op.lte]: minSentimentScore },
      qualityScore: { [Op.lte]: minQualityScore }
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
const markClicked = async (req, res, next) => {
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

    await article.update({ clickedInd: 1 });

    res.status(200).json({ 
      message: "Article marked as clicked",
      articleId: articleId
    });
  } catch (err) {
    console.error("Error in markClicked:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Get multiple article details by IDs
const articleDetails = async (req, res, next) => {
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
      order: [
        ["published", sort === "IMPORTANCE" ? "DESC" : sort]
      ],
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
    
    // If sorting by importance, compute importance scores and sort
    if (sort.toUpperCase() === "IMPORTANCE") {
      const sortedArticles = articles
        .map(article => ({
          article,
          importance: computeImportance(article)
        }))
        .sort((a, b) => b.importance - a.importance)
        .map(item => item.article);
      
      return res.status(200).json(sortedArticles);
    } else {
      return res.status(200).json(articles);
    }
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

// Mark article as read
const articleMarkToRead = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const articleId = req.params.articleId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    // Mark article as read
    const result = await updateArticleStatus(userId, articleId, "read");
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message || "Error updating article"
      });
    }

    // If clusterView is enabled, mark all articles in the same cluster as read
    const clusterView = req.body?.clusterView === true || req.body?.clusterView === 'true';
    if (clusterView) {
      if (result.article.clusterId) {
        console.log(`Cluster view enabled: marking all articles in cluster ${result.article.clusterId} as read`);
        await Article.update(
          { status: 'read' },
          {
            where: {
              id: { [Op.ne]: articleId }, // Exclude the already updated article
              userId: userId,
              clusterId: result.article.clusterId
            }
          }
        );
      }
    }
    
    return res.status(result.statusCode).json(result.article);
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

// Mark article as unread
const articleMarkToUnread = async (req, res, next) => {
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
const articleMarkWithStar = async (req, res, next) => {
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
      .update({ starInd }, { where: { userId: userId }})
      .then(() => res.status(200).json(article))
      .catch(error => res.status(400).json(error));
  } catch (err) {
    console.log(err);
    return res.status(500).json(err);
  }
};

// Mark all articles as read
const articleMarkAllAsRead = async (req, res, next) => {
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
  articleDetails,
  articleMarkToRead,
  articleMarkToUnread,
  articleMarkWithStar,
  articleMarkAllAsRead
}