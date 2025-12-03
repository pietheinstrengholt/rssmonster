import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Tag from "../models/tag.js";
import cache from "../util/cache.js";
import { Op } from 'sequelize';
import { updateSettings } from "./setting.js";

// Get all article IDs based on query parameters
const getArticles = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const categoryId = req.query.categoryId || "%";
    const feedId = req.query.feedId || "%";
    const status = req.query.status || "unread";
    const sort = req.query.sort || "DESC";
    const tag = (req.query.tag || "").trim();
    const minAdvertisementScore = parseInt(req.query.minAdvertisementScore) || 100;
    const minSentimentScore = parseInt(req.query.minSentimentScore) || 100;
    const minQualityScore = parseInt(req.query.minQualityScore) || 100;
    const viewMode = req.query.viewMode || "full";
    
    // Set default values for search
    let search = req.query.search || "%";
    if (search !== "%") search = `%${search}%`;

    // If tag is provided, short-circuit and return articles by tag only
    if (tag) {
      try {
        // Find all tag rows for this user and tag name
        const tagRows = await Tag.findAll({
          where: { userId: userId, name: tag },
          attributes: ["articleId"],
        });

        const taggedArticleIds = tagRows.map(t => t.articleId);

        if (taggedArticleIds.length === 0) {
          return res.status(200).json({
            query: [{ userId: userId, tag: tag, sort: sort }],
            itemIds: []
          });
        }

        // Order by published to be consistent with other flows
        const taggedArticles = await Article.findAll({
          attributes: ["id"],
          where: { userId: userId, id: taggedArticleIds },
          order: [["published", sort]]
        });

        const itemIds = taggedArticles.map(a => a.id);

        return res.status(200).json({
          query: [{ userId: userId, tag: tag, sort: sort }],
          itemIds: itemIds
        });
      } catch (err) {
        console.error("Error fetching articles by tag:", err);
        return res.status(500).json({ error: err.message });
      }
    }

    // Get feeds based on categoryId
    const feedQuery = categoryId === "%" 
      ? { attributes: ["id"] }
      : { 
          attributes: ["id"],
          where: { 
            userId: userId,
            categoryId: { [Op.like]: categoryId }
          }
        };
    
    const feeds = await Feed.findAll(feedQuery);

    // Determine feed IDs to query
    const feedIds = feedId !== "%" 
      ? feedId 
      : feeds.map(feed => feed.id);

    // Base query conditions
    const baseWhere = {
      userId: userId,
      feedId: feedIds,
      subject: { [Op.like]: search },
      content: { [Op.like]: search },
      advertisementScore: { [Op.lte]: minAdvertisementScore },
      sentimentScore: { [Op.lte]: minSentimentScore },
      qualityScore: { [Op.lte]: minQualityScore }
    };

    // Build query based on status
    let articleQuery = {
      attributes: ["id"],
      order: [["published", sort]],
      where: baseWhere
    };

    if (status === "star") {
      articleQuery.where.starInd = 1;
    } else if (status === "hot") {
      delete articleQuery.where.feedId; // Hot articles ignore feedId
      articleQuery.where.url = cache.all();
    } else {
      articleQuery.where.status = status;
    }

    const articles = await Article.findAll(articleQuery);
    const itemIds = articles.map(article => article.id);

    // Update user settings (skip when tag-based query is used)
    // Note: tag is not persisted in settings currently
    await updateSettings(userId, {
      categoryId,
      feedId,
      status,
      sort,
      minAdvertisementScore,
      minSentimentScore,
      minQualityScore,
      viewMode
    });

    res.status(200).json({
      query: [{
        userId: userId,
        categoryId: categoryId,
        feedId: feedId,
        sort: sort,
        status: status,
        search: search,
        tag: tag
      }],
      itemIds: itemIds
    });
  } catch (err) {
    console.error("Error in getArticles:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Get single article details by ID
const getArticle = async (req, res, next) => {
  try {
    const articleId = req.params.articleId;
    const userId = req.userData.userId;
    
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

// Mark all unread articles as read
const markAsRead = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const categoryId = req.body.categoryId || "%";
    const feedId = req.body.feedId || "%";
    const minAdvertisementScore = parseInt(req.body.minAdvertisementScore) || 100;
    const minSentimentScore = parseInt(req.body.minSentimentScore) || 100;
    const minQualityScore = parseInt(req.body.minQualityScore) || 100;

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

export default {
  getArticles,
  getArticle,
  markAsRead,
  markClicked
}