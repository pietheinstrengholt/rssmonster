import Article from "../models/article.js";
import Feed from "../models/feed.js";
import Tag from "../models/tag.js";
import cache from "../util/cache.js";
import { Op } from 'sequelize';
import Setting from "../models/setting.js";

/**
 * Get all article IDs based on query parameters with advanced filtering.
 * Supports field filters in search string: star:true/false, unread:true/false, clicked:true/false,
 * tag:name, title:text, sort:DESC/ASC, and date filters: @YYYY-MM-DD, @today, @yesterday, @"N days ago", @"last DayName"
 */
const getArticles = async (req, res, next) => {
  try {
    // Extract base query parameters from request
    const userId = req.userData.userId;

    // Ensure userId is present
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const categoryId = req.query.categoryId || "%"; // "%" means all categories
    const feedId = req.query.feedId || "%"; // "%" means all feeds
    const status = req.query.status || "unread"; // Default to unread articles
    const minAdvertisementScore = req.query.minAdvertisementScore != null ? parseInt(req.query.minAdvertisementScore) : 100;
    const minSentimentScore = req.query.minSentimentScore != null ? parseInt(req.query.minSentimentScore) : 100;
    const minQualityScore = req.query.minQualityScore != null ? parseInt(req.query.minQualityScore) : 100;
    const viewMode = req.query.viewMode || "full";
    
    /**
     * Parse search query and extract field filters.
     * Field filters can override default query parameters and combine with text search.
     * Supported filters: star:true/false, unread:true/false, clicked:true/false,
     * tag:name, title:text, sort:DESC/ASC, @YYYY-MM-DD, @today, @yesterday, @"N days ago", @"last DayName"
     */
    const rawSearch = (req.query.search || "").trim();
    let starFilter = null; // When set, overrides status parameter to filter by starInd
    let unreadFilter = null; // When set, overrides status parameter to filter by read/unread
    let clickedFilter = null; // When set, filters by clickedInd
    let tagFilter = null; // Tag name extracted from search (tag:something)
    let sortFilter = null; // Sort direction extracted from search (sort:DESC/ASC)
    let titleFilter = null; // Title-specific search (title:text) - searches title only
    let dateRange = null; // Date range object: { start: Date, end: Date }
    let dateToken = null; // Original date token to echo back in response

    /**
     * Pre-scan for patterns with spaces before tokenizing.
     * These patterns can contain spaces, so we need to handle them separately.
     * Supported patterns:
     * - @"N days ago": @"2 days ago" searches for exactly N calendar days ago
     * - @"last DayName": @"last Monday" searches for most recent occurrence of that day
     * The quotes are optional for both patterns.
     */
    let workingSearch = rawSearch;
    
    // Pattern: @"N days ago"
    const daysAgoMatch = rawSearch.match(/@"?(\d+)\s+days\s+ago"?/i);
    if (daysAgoMatch) {
      const days = parseInt(daysAgoMatch[1], 10);
      if (!Number.isNaN(days)) {
        dateToken = `${days} days ago`;
        // Calculate UTC day range for exactly N days ago (00:00:00 to 23:59:59)
        const today = new Date();
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days, 0, 0, 0, 0));
        const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days, 23, 59, 59, 999));
        dateRange = { start, end };
        console.log(`Date filter applied via search token: ${dateToken} (exact UTC day)`);
        // Remove the matched segment so it doesn't pollute text search tokens
        workingSearch = workingSearch.replace(daysAgoMatch[0], "").trim();
      }
    }
    
    // Pattern: @"last DayName" (e.g., @"last Monday")
    const lastDayMatch = rawSearch.match(/@"?last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"?/i);
    if (lastDayMatch && !dateRange) { // Only apply if no other date filter matched
      const dayName = lastDayMatch[1].toLowerCase();
      const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      const targetDay = dayMap[dayName];
      
      dateToken = `last ${dayName}`;
      // Calculate most recent occurrence of target day
      const today = new Date();
      const currentDay = today.getUTCDay();
      let daysBack = currentDay - targetDay;
      if (daysBack <= 0) daysBack += 7; // Go back to previous week if target day hasn't occurred this week
      
      const targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack, 0, 0, 0, 0));
      const start = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
      const end = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));
      dateRange = { start, end };
      console.log(`Date filter applied via search token: ${dateToken} (${start.toISOString().split('T')[0]})`);
      // Remove the matched segment so it doesn't pollute text search tokens
      workingSearch = workingSearch.replace(lastDayMatch[0], "").trim();
    }

    /**
     * Tokenize the search string and extract field filters.
     * Split on whitespace or commas to support various input styles.
     * Examples: "star:true unread:true", "star:true, unread:true", "tag:tech @today"
     */
    const tokens = workingSearch === "%" ? [] : workingSearch.split(/[\s,]+/).filter(Boolean);
    const remainingTokens = []; // Non-filter tokens that will be used for text search

    tokens.forEach(tok => {
      // Clean trailing punctuation (allows: "star:true," or "tag:tech;")
      const cleaned = tok.replace(/[.,;]+$/, "");

      // Match various field filter patterns
      const starMatch = cleaned.match(/^star:(true|false)$/i); // star:true or star:false
      const unreadMatch = cleaned.match(/^unread:(true|false)$/i); // unread:true or unread:false
      const clickedMatch = cleaned.match(/^clicked:(true|false)$/i); // clicked:true or clicked:false
      const tagMatch = cleaned.match(/^tag:(.+)$/i); // tag:technology, tag:news, etc.
      const titleMatch = cleaned.match(/^title:(.+)$/i); // title:javascript, title:AI, etc.
      const sortMatch = cleaned.match(/^sort:(DESC|ASC)$/i); // sort:DESC or sort:ASC
      const dateMatch = cleaned.match(/^@(\d{4}-\d{2}-\d{2})$/); // @2025-12-14
      const todayMatch = cleaned.match(/^@today$/i); // @today (last 24 hours)
      const yesterdayMatch = cleaned.match(/^@yesterday$/i); // @yesterday (previous UTC day)
      
      if (starMatch) {
        starFilter = starMatch[1].toLowerCase() === 'true';
        console.log(`Star filter applied via search token: ${starFilter}`);
      } else if (unreadMatch) {
        unreadFilter = unreadMatch[1].toLowerCase() === 'true';
        console.log(`Unread filter applied via search token: ${unreadFilter}`);
      } else if (clickedMatch) {
        clickedFilter = clickedMatch[1].toLowerCase() === 'true';
        console.log(`Clicked filter applied via search token: ${clickedFilter}`);
      } else if (tagMatch) {
        tagFilter = tagMatch[1].trim();
        console.log(`Tag filter applied via search token: ${tagFilter}`);
      } else if (titleMatch) {
        titleFilter = titleMatch[1].trim();
        console.log(`Title filter applied via search token: ${titleFilter}`);
      } else if (sortMatch) {
        sortFilter = sortMatch[1].toUpperCase();
        console.log(`Sort filter applied via search token: ${sortFilter}`);
      } else if (dateMatch) {
        // @YYYY-MM-DD: Specific calendar day in UTC
        dateToken = dateMatch[1];
        dateRange = {
          start: new Date(`${dateMatch[1]}T00:00:00.000Z`),
          end: new Date(`${dateMatch[1]}T23:59:59.999Z`)
        };
        console.log(`Date filter applied via search token: ${dateToken}`);
      } else if (todayMatch) {
        // @today: Rolling 24-hour window from now back
        dateToken = "today";
        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        dateRange = { start, end: now };
        console.log("Date filter applied via search token: today (last 24h)");
      } else if (yesterdayMatch) {
        // @yesterday: Previous UTC calendar day (00:00:00 to 23:59:59)
        dateToken = "yesterday";
        const today = new Date();
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1, 23, 59, 59, 999));
        dateRange = { start, end };
        console.log("Date filter applied via search token: yesterday (UTC day)");
      } else {
        remainingTokens.push(cleaned);
      }
    });

    /**
     * Build LIKE search pattern from remaining (non-filter) tokens.
     * If only field filters were provided (no text search), use wildcard to match all.
     * Example: "javascript @today" → search for "javascript", filter by today
     * Example: "@today sort:ASC" → no text search (wildcard), just filters
     *
     * Special case: if title: filter is present, it searches title separately
     * Example: "title:meter" → search title for "meter"
    * Example: "title:javascript ai" → title contains "javascript" AND content contains "ai"
     */
    const search = remainingTokens.length === 0 ? "%" : `%${remainingTokens.join(" ")}%`;

    /**
     * Determine final filter values.
     * Field filters from search string take precedence over query parameters.
     */
    // Sort: search token (sort:ASC/DESC) overrides query param
    let sort = sortFilter !== null ? sortFilter : (req.query.sort || "DESC");
    console.log(`Final sort value: "${sort}"`);

    // Tag: search token (tag:name) overrides query param
    let tag = tagFilter !== null ? tagFilter : (req.query.tag || "").trim();
    console.log(`Final tag value: "${tag}"`);

    /**
     * If tag filter is present, fetch all article IDs with that tag.
     * Tags are stored in a separate table with articleId references.
     */
    let taggedArticleIds = null;
    if (tag) {
      try {
        // Find all tag rows for this user and tag name
        const tagRows = await Tag.findAll({
          where: { userId: userId, name: tag },
          attributes: ["articleId"],
        });

        // Extract article IDs from tag rows
        taggedArticleIds = tagRows.map(t => t.articleId);
        console.log(`Found ${taggedArticleIds.length} articles with tag "${tag}" for user ${userId}`);

        // If tag was provided but no articles found, return empty result
        if (taggedArticleIds.length === 0) {
          return res.status(200).json({
            query: [{ userId: userId, tag: tag, sort: sort }],
            itemIds: []
          });
        }
      } catch (err) {
        console.error("Error fetching articles by tag:", err);
        return res.status(500).json({ error: err.message });
      }
    }

    /**
     * Determine which feeds to query based on categoryId.
     * If categoryId is "%" (all), get all feeds for the user.
     * Otherwise, get only feeds in the specified category.
     */
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

    /**
     * Final feed ID list to query.
     * If specific feedId provided, use it; otherwise use all feeds from category query.
     */
    const feedIds = feedId !== "%" 
      ? feedId 
      : feeds.map(feed => feed.id);

    /**
     * Build base WHERE clause for article query.
     * Combines user/feed filtering with text search (OR on title/content)
     * and quality score thresholds.
     */
    const baseWhere = {
      userId: userId,
      feedId: feedIds,
      // Quality filters: exclude low-quality/spam articles
      advertisementScore: { [Op.lte]: minAdvertisementScore },
      sentimentScore: { [Op.lte]: minSentimentScore },
      qualityScore: { [Op.lte]: minQualityScore }
    };

    // Text search logic:
    // - If title: filter present: search title for that value, AND content for remaining tokens
    // - If no title: filter: search both title OR content for all tokens
    if (titleFilter) {
      // title:value specified - search title for exact value
      baseWhere.title = { [Op.like]: `%${titleFilter}%` };
      // If there are remaining tokens, also search content for them
      if (remainingTokens.length > 0) {
        baseWhere.contentOriginal = { [Op.like]: search };
      }
      console.log(`Title search: "%${titleFilter}%", Content search: "${search}"`);
    } else {
      // No title: filter - search both title OR content
      baseWhere[Op.or] = [
        { title: { [Op.like]: search } },
        { contentOriginal: { [Op.like]: search } }
      ];
    }

    // Apply date range filter if present (supports all date patterns)
    if (dateRange) {
      baseWhere.published = { [Op.between]: [dateRange.start, dateRange.end] };
    }

    // Apply tag filter if present (restricts to specific article IDs)
    if (taggedArticleIds !== null && taggedArticleIds.length > 0) {
      baseWhere.id = taggedArticleIds;
    }

    /**
     * Build final article query.
     * Start with base WHERE conditions, then apply field filters if present.
     */
    let articleQuery = {
      attributes: ["id"], // Only fetch IDs for performance (full details fetched later)
      order: [["published", sort]], // Sort by publication date
      where: baseWhere
    };

    /**
     * Field filters from search take precedence over status parameter.
     * If any field filter is present, it overrides the default status-driven logic.
     */
    if (starFilter !== null) {
      // star:true → only starred articles, star:false → only non-starred
      articleQuery.where.starInd = starFilter ? 1 : 0;
    }

    if (unreadFilter !== null) {
      // unread:true → only unread, unread:false → only read
      articleQuery.where.status = unreadFilter ? "unread" : "read";
    }

    if (clickedFilter !== null) {
      // clicked:true → only clicked articles, clicked:false → only non-clicked
      articleQuery.where.clickedInd = clickedFilter ? 1 : 0;
    }

    /**
     * If no field filters are present, use traditional status-driven logic.
     * Status can be: "unread", "read", "star", "hot", or "clicked".
     */
    if (starFilter === null && unreadFilter === null && clickedFilter === null) {
      if (status === "star") {
        articleQuery.where.starInd = 1;
      } else if (status === "hot") {
        delete articleQuery.where.feedId; // Hot articles ignore feedId
        articleQuery.where.url = cache.all();
      } else if (status === "clicked") {
        articleQuery.where.clickedInd = 1;
      } else {
        articleQuery.where.status = status;
      }
    }

    // Fetch articles based on constructed query
    const articles = await Article.findAll(articleQuery);
    const itemIds = articles.map(article => article.id);

    // Update user settings (skip when tag-based query is used)
    // Note: tag is not persisted in settings currently
    const existingSettings = await Setting.findOne({ where: { userId: userId }, raw: true });
    
    if (existingSettings) {
      await Setting.update({
        categoryId: categoryId,
        feedId: feedId,
        status: status,
        sort: sort,
        minAdvertisementScore: minAdvertisementScore,
        minSentimentScore: minSentimentScore,
        minQualityScore: minQualityScore,
        viewMode: viewMode
      }, {
        where: { userId: userId }
      });
    } else {
      await Setting.create({
        userId: userId,
        categoryId: categoryId,
        feedId: feedId,
        status: status,
        sort: sort,
        minAdvertisementScore: minAdvertisementScore,
        minSentimentScore: minSentimentScore,
        minQualityScore: minQualityScore,
        viewMode: viewMode
      });
    }

    res.status(200).json({
      query: [{
        userId: userId,
        categoryId: categoryId,
        feedId: feedId,
        sort: sort,
        status: status,
        search: search,
        tag: tag,
        date: dateToken
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
        }
      ],
      order: [
        ["published", sort]
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
    
    const result = await updateArticleStatus(userId, articleId, "read");
    
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