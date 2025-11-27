import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Tag from "../models/tag.js";
import Setting from "../models/setting.js";
import cache from "../util/cache.js";
import { Op } from 'sequelize';

// Get all article IDs based on query parameters
const getArticles = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    const categoryId = req.query.categoryId || "%";
    const feedId = req.query.feedId || "%";
    const status = req.query.status || "unread";
    const sort = req.query.sort || "DESC";
    
    // Set default values for search
    let search = req.query.search || "%";
    if (search !== "%") search = `%${search}%`;

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
      content: { [Op.like]: search }
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

    // Update user settings
    await Setting.destroy({ where: { userId: userId } });
    await Setting.create({
      userId: userId,
      categoryId: categoryId,
      feedId: feedId,
      status: status,
      sort: sort
    });

    res.status(200).json({
      query: [{
        userId: userId,
        categoryId: categoryId,
        feedId: feedId,
        sort: sort,
        status: status,
        search: search
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
const postArticles = async (req, res, next) => {
  try {
    const userId = req.userData.userId;
    
    await Article.update(
      { status: "read" },
      { 
        where: {
          userId: userId,
          status: "unread" 
        }
      }
    );

    res.status(200).json({ message: "All articles marked as read" });
  } catch (err) {
    console.error("Error in postArticles:", err);
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getArticles,
  getArticle,
  postArticles
}