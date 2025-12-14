import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Category from "../models/category.js";
import Feed from "../models/feed.js";
import Article from "../models/article.js";
import { Op, fn, col, literal } from 'sequelize';
import cache from "../util/cache.js";
import crawlController from "./crawl.js";
import Tag from "../models/tag.js";

// Shared helper to build tool result
function makeResult({ structured, error=false }) {
  const text = JSON.stringify(structured);
  return {
    content: [
      {
        type: "text",
        text: text
      }
    ],
    structuredContent: structured,
    isError: error
  };
}

// Shared helper to generate HTML for articles
function generateArticlesHtml(articles, options = {}) {
  const { title = "Articles", emoji = "", backgroundColor = "", feedName = "", feedUrl = "" } = options;
  
  let html = `<h3>${emoji ? emoji + ' ' : ''}${title}</h3>`;
  if (feedName && feedUrl) {
    html += `<p><strong>Feed:</strong> <a href="${feedUrl}" target="_blank">${feedName}</a></p>`;
  }
  html += `<p>Total articles: <strong>${articles.length}</strong></p>`;
  
  if (articles.length > 0) {
    articles.forEach(article => {
      html += `<div class="block" id="${article.id}">`;
      html += '<div class="article">';
      html += '<div class="maximal">';
      html += '<h5 class="heading">';
      html += `${emoji ? emoji + ' ' : ''}<a target="_blank" href="${article.url || '#'}">${article.title || 'No Title'}</a>`;
      html += '</h5>';
      html += '<div class="feedname">';
      html += `<span class="published_date">${article.published ? new Date(article.published).toLocaleString() : new Date(article.createdAt).toLocaleString()}</span>`;
      if (article.author || feedName) {
        html += '<span class="break">by</span>';
        html += '<span class="feed_name">';
        if (feedName && feedUrl) {
          html += `<a target="_blank" href="${feedUrl}">${feedName}</a>`;
        } else if (article.author) {
          html += article.author;
        }
        html += '</span>';
      }
      html += '</div>';
      html += '</div>';
      html += '<div class="article-content">';
      html += `<div class="article-body">${article.content || ''}</div>`;
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
  } else {
    html += '<p><em>No articles found.</em></p>';
  }
  
  return html;
}

const postMcp = async (req, res) => {
  try {
    // Authenticate user
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ 
        error: "Authentication error", 
        message: "Missing or invalid authentication token. Please include a valid JWT token in the request headers using 'Authorization: Bearer <token>'. You can obtain a token by authenticating through the /api/auth/login endpoint." 
      });
    }

    // Define MCP server with tools
    const server = new McpServer({
      name: "mcp-rssmonster-server",
      version: "1.0.0",
      instructions: `
    RSSMonster Data Model:
    - Categories contain multiple Feeds (many-to-one relationship: many feeds belong to one category)
    - Feeds contain multiple Articles (one-to-many relationship: one feed has many articles)
    - Each Article belongs to exactly one Feed, and each Feed belongs to exactly one Category
    
    You have access to the following tools:

    1. categories
      - Provides a list of all categories with details like ID, name, description, and order.
      - Use this to explore or filter content by category.
      - Each category can have multiple feeds associated with it.

    2. feeds
      - Returns a list of all feeds along with their feedIds, categoryId, and metadata.
      - Use this if you need to find feedIds before fetching articles.
      - Each feed belongs to exactly one category and contains multiple articles.

    3. search_feed_by_name
      - Returns detailed information about a specific feed by searching its name.
      - Useful to get metadata for a single feed before querying its articles.

    4. search_articles_by_keyword
      - Searches for articles containing a specific keyword in the title or content.
      - The agent must summarize each article in the results.
      - Use this when the user wants content on a specific topic.

    5. search_articles_by_time
      - Searches for articles created within a given time window (in seconds) from now.
      - The agent must summarize each article returned.
      - Example: To fetch articles from the last hour, set seconds = 3600.

    6. articles_by_feed_id
      - Retrieves all articles for a specific feed using feedId.
      - The agent must summarize each article returned.
      - If the feedId is unknown, first use feeds to obtain all feedIds.
      - Remember: each article belongs to exactly one feed.

    7. favorite_articles
      - Returns all articles where status = "star".  
      - You MUST summarize each returned article.

    8. hot_articles
      - Returns all articles considered “hot”, based on an internal cache of URLs.  
      - Does not require a search term.  
      - You MUST summarize each article.

    9. feeds_by_category_id
      - Retrieves all feeds associated with a specific category, identified by its categoryId.
      - Provides a list of all feeds with details like ID, name, URL, and category.
      - Use this to discover all feeds within a specific category before fetching their articles.

    10. current_time
      - Returns the current server time as an ISO-8601 timestamp.
      - This is the standard format agents typically use for time calculations.

    11. crawl
      - Triggers the RSS feed crawler to fetch new articles from all active feeds.
      - This will check all feeds and import new articles into the database.
      - Use this when the user asks to refresh feeds, update articles, or crawl for new content.

    12. popular_tags
      - Returns the top 10 most popular tags for the authenticated user.
      - Useful to understand reader interests and guide queries.

    13. articles_by_tag
      - Returns all articles that have a given tag name for the authenticated user.
      - Use this after popular_tags (or when user specifies a tag) to focus content.

    14. search_tag_by_keyword
      - Searches for tags whose names contain the given keyword (substring match).
      - Returns matched tag names with usage counts (frequency across articles).
      - Useful to discover related or emerging interest areas from partial terms.

    15. search_clicked_articles
      - Returns articles that have been clicked by the user (clickedInd = 1).
      - Optionally filter by feedId and/or time window (seconds from now).
      - Useful to understand which articles users actually engaged with.

    16. tags_clicked_articles
      - Returns the top 10 most used tags among articles that have been clicked (clickedInd = 1).
      - Useful to analyze engagement topics and guide queries.

    17. category_details
      - Returns detailed information about a specific category by its categoryId.
      - Provides metadata like name, description, and order.
      - Includes all feeds associated with that category.

    Important Notes for the Agent:
    - You are allowed and encouraged to **use multiple tools together** to obtain the required results.
      For example, to get all articles from feeds in a specific category:
        1) Call feeds_by_category_id to get all feeds in that category.
        2) Call articles_by_feed_id for each feed to get their articles.
      Or to get articles from a feed by name:
        1) Call feeds to find the feedId.
        2) Call articles_by_feed_id with the obtained feedId.
    - On the client side, the user may provide a series of messages as chat history.
      Use this chat history to understand the context of the conversation and provide relevant answers.
    - On the client side, the front end renders HTML content directly.
    - For all article-related tools, always provide summaries of each article's content to the user. Wrap the article title in a link to the article URL.
    - Structured data from each tool is returned in structuredContent, but you may also use the textual fallback for communication.
    - Follow these guidelines to combine results and ensure all relevant information is provided in a structured and user-friendly way.
      `
    });

    // Tool: 1. categories
    server.tool(
      "categories",
      "Provides a list of all categories with details like ID, name, description, and order.",
      async () => {
        console.log('[MCP Tool Called] categories');
        try {
          const categories = await Category.findAll({
            where: { userId: userId },
            order: [["categoryOrder", "ASC"], ["name", "ASC"]],
            raw: true
          });

          console.log("Fetched categories:", categories);

          return makeResult({ structured: { categories } });
        } catch (err) {
          console.error("Error fetching categories:", err);
          return makeResult({ structured: { error: "Failed to fetch categories." }, error: true });
        }
      }
    );

    // Tool: 2. feeds
    server.tool(
      "feeds",
      "Provides a list of all feeds with details like ID, name, URL, and category.",
      async () => {
        console.log('[MCP Tool Called] feeds');
        try {
          const feeds = await Feed.findAll({
            where: { userId: userId },
            order: [["feedName", "ASC"]],
            raw: true
          });

          console.log("Fetched feeds:", feeds);

          return makeResult({ structured: { feeds } });
        } catch (err) {
          console.error("Error fetching feeds:", err);
          return makeResult({ structured: { error: "Failed to fetch feeds." }, error: true });
        }
      }
    );

    // Tool: 3. search_feed_by_name
    server.tool(
      "search_feed_by_name",
      "Searches for a feed by its name and returns detailed information about the feed, like ID, URL, description, and categoryId.",
      {
        feed_name: z.string()
      },
      async ({ feed_name }) => {
        console.log('[MCP Tool Called] search_feed_by_name - feed_name:', feed_name);
        try {
          const feed = await Feed.findOne({ 
            where: { 
              [Op.or]: [
                { feedName: { [Op.like]: `%${feed_name}%` } },
                { feedDesc: { [Op.like]: `%${feed_name}%` } }
              ],
              userId: userId 
            }, 
            raw: true 
          });
          console.log(`Fetched feed for name "${feed_name}":`, feed);

          if (!feed) {
            return makeResult({ structured: { error: `No feed found with name "${feed_name}".` }, error: true });
          }

          return makeResult({ structured: { feed } });
        } catch (err) {
          console.error("Error fetching feed:", err);
          return makeResult({ structured: { error: "Failed to fetch feed." }, error: true });
        }
      }
    );

    // Tool: 4. search_articles_by_keyword
    server.tool(
      "search_articles_by_keyword",
      `
      Searches for articles containing a specific keyword in the title or content.
      The agent must summarize each article in the results (e.g., 2-3 sentence summaries 
      based on the article title and content).

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.
      
      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".
      `,
      {
        search: z.string().describe("Keyword to search for in the article title or content."),

        feedId: z.string()
          .optional()
          .describe("Optional feedId. If omitted, articles from all feeds are included."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),
      },
      async ({ search, feedId, status }) => {
        console.log('[MCP Tool Called] search_articles_by_keyword - search:', search, 'feedId:', feedId, 'status:', status);
        try {
          const articles = await Article.findAll({
            where: {
              userId: userId,
              status: status,
              ...(feedId ? { feedId: feedId } : {}),
              [Op.or]: [
                { title: { [Op.like]: `%${search}%` } },
                { content: { [Op.like]: `%${search}%` } },
              ],
            },
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} articles for search "${search}"`);

          const html = generateArticlesHtml(articles, {
            title: `Search Results for "${search}"`,
          });

          const structured = {
            searchQuery: search,
            totalResults: articles.length,
            htmlOutput: html,
            articles: articles
          };

          return makeResult({ structured });
        } catch (err) {
          console.error("Error fetching articles:", err);
          return makeResult({
            structured: { error: "Failed to fetch articles." },
            error: true,
          });
        }
      }
    );

    // Tool: 5. search_articles_by_time
    server.tool(
      "search_articles_by_time",
      `
      Searches for articles created within a specified time window (in seconds) from now,
      based on the "createdAt" field.

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.

      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".

      Examples:
      - Last hour: seconds = 3600
      - Last day: seconds = 86400

      The agent must summarize each article returned.
      `,
      {
        seconds: z.number()
          .min(1)
          .describe("The time window (in seconds) from the current time to look back."),
        
        feedId: z.string()
          .optional()
          .describe("Optional feedId. If omitted, articles from all feeds are included."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),
      },
      async ({ seconds, feedId, status }) => {
        console.log('[MCP Tool Called] search_articles_by_time - seconds:', seconds, 'feedId:', feedId, 'status:', status);
        try {
          const now = new Date();
          const fromTime = new Date(now.getTime() - seconds * 1000);

          const articles = await Article.findAll({
            where: {
              userId: userId,
              status: status,
              createdAt: {
                [Op.between]: [fromTime, now],
              },
              ...(feedId ? { feedId: feedId } : {}),
            },
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(
            `Fetched ${articles.length} articles created between ${fromTime.toISOString()} and ${now.toISOString()}`
          );

          const structured = {
            timeWindowSeconds: seconds,
            from: fromTime.toISOString(),
            to: now.toISOString(),
            articles: articles.map(article => ({
              id: article.id,
              title: article.title,
              author: article.author,
              createdAt: article.createdAt,
              contentSnippet: article.content?.slice(0, 300) || "",
              note: "The agent must summarize this article based on its title and content.",
            })),
          };

          return makeResult({ structured });
        } catch (err) {
          console.error("Error fetching recent articles:", err);
          return makeResult({
            structured: { error: "Failed to fetch recent articles." },
            error: true,
          });
        }
      }
    );

    // Tool: 6. articles_by_feed_id
    server.tool(
      "articles_by_feed_id",
      `
      Retrieves all articles associated with a specific feed, identified by its feedId.
      The agent should summarize each article returned in the results 
      (e.g., a 2–3 sentence summary based on title and content).
      
      Note: If the agent does not know the feedId, it must first call the "feeds" tool 
      to retrieve a list of all available feeds along with their corresponding feedIds.

      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".

      You may optionally provide a time window:
      - If "seconds" is provided, only articles created within that time window are returned.
      - If "seconds" is NOT provided, all articles from the feed are returned regardless of when.

      Examples:
      - Last hour: seconds = 3600
      - Last day: seconds = 86400
      `,
      {
        feedId: z.number().describe("The unique identifier (ID) of the feed to fetch articles for."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),

        seconds: z.number()
          .min(1)
          .optional()
          .describe("Optional time window (in seconds) from the current time to look back. If omitted, all articles from the feed are returned."),
      },
      async ({ feedId, status, seconds }) => {
        console.log('[MCP Tool Called] articles_by_feed_id - feedId:', feedId, 'status:', status, 'seconds:', seconds);
        try {
          const feed = await Feed.findOne({ where: { id: feedId, userId: userId }, raw: true });
          if (!feed) {
            return makeResult({
              structured: { error: `No feed found with ID ${feedId}.` },
              error: true,
            });
          }

          const whereClause = {
            feedId,
            userId: userId,
            status: status
          };

          // If seconds is provided, add time filter
          if (seconds) {
            const now = new Date();
            const fromTime = new Date(now.getTime() - seconds * 1000);
            whereClause.createdAt = {
              [Op.between]: [fromTime, now],
            };
          }

          const articles = await Article.findAll({
            where: whereClause,
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} articles for feed ID ${feedId}`);

          const html = generateArticlesHtml(articles, {
            title: `Articles from ${feed.feedName}`,
            feedName: feed.feedName,
            feedUrl: feed.url || '#'
          });

          const structured = {
            feed,
            totalArticles: articles.length,
            ...(seconds ? { timeWindowSeconds: seconds } : {}),
            htmlOutput: html,
            articles: articles
          };

          return makeResult({ structured });
        } catch (err) {
          console.error("Error fetching articles by feed:", err);
          return makeResult({
            structured: { error: "Failed to fetch articles for this feed." },
            error: true,
          });
        }
      }
    );

    // Tool: 7. favorite_articles
    server.tool(
      "favorite_articles",
      `
      Retrieves all articles that are marked as favorites (where starInd = 1).
      The agent must summarize each article returned in the results (e.g., a 2–3 sentence summary).

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.

      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".

      You may optionally provide a time window:
      - If "seconds" is provided, only articles favorited within that time window are returned.
      - If "seconds" is NOT provided, all favorite articles are returned regardless of when.

      Examples:
      - Last hour: seconds = 3600
      - Last day: seconds = 86400
      `,
      {
        feedId: z.string()
          .optional()
          .describe("Optional feedId. If omitted, articles from all feeds are included."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),

        seconds: z.number()
          .min(1)
          .optional()
          .describe("Optional time window (in seconds) from the current time to look back. If omitted, all favorite articles are returned."),
      },
      async ({ feedId, status, seconds }) => {
        console.log('[MCP Tool Called] favorite_articles - feedId:', feedId, 'status:', status, 'seconds:', seconds);
        try {
          const whereClause = {
            starInd: 1,
            userId: userId,
            status: status,
            ...(feedId ? { feedId: feedId } : {}),
          };

          // If seconds is provided, add time filter
          if (seconds) {
            const now = new Date();
            const fromTime = new Date(now.getTime() - seconds * 1000);
            whereClause.updatedAt = {
              [Op.between]: [fromTime, now],
            };
          }

          const articles = await Article.findAll({
            where: whereClause,
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} favorite (starred) articles`);

          const html = generateArticlesHtml(articles, {
            title: 'Favorite Articles',
            emoji: '⭐'
          });

          const structured = {
            totalFavorites: articles.length,
            ...(seconds ? { timeWindowSeconds: seconds } : {}),
            ...(feedId ? { feedId: feedId } : {}),
            htmlOutput: html,
            articles: articles
          };

          return makeResult({ structured });
        } catch (err) {
          console.error("Error fetching favorite articles:", err);
          return makeResult({
            structured: { error: "Failed to fetch favorite articles." },
            error: true,
          });
        }
      }
    );

    // Tool: 8. hot_articles
    server.tool(
      "hot_articles",
      `
      Retrieves all hot articles. Hot articles are determined by your internal cache
      (via cache.all()), which provides a list of URLs that should be considered hot.
      Results are sorted by the 'published' field in the requested order.

      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".

      The agent must summarize each article returned.
      `,
      {
        sort: z.enum(["ASC", "DESC"])
          .default("DESC")
          .describe("Sorting order for the 'published' field."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),
      },
      async ({ sort, status }) => {
        console.log('[MCP Tool Called] hot_articles - sort:', sort, 'status:', status);
        try {
          // Retrieve list of hot article URLs or IDs from cache
          const hotArticleIds = cache.all(); // must be an array of URLs (or IDs)

          const articles = await Article.findAll({
            where: {
              url: hotArticleIds,
              userId: userId,
              status: status
            },
            order: [["published", sort]],
            raw: true
          });

          console.log(
            `Fetched ${articles.length} hot articles sorted=${sort}`
          );

          const html = generateArticlesHtml(articles, {
            title: 'Hot Articles',
            emoji: '🔥'
          });

          const structured = {
            sortOrder: sort,
            totalHotArticles: articles.length,
            htmlOutput: html,
            articles: articles
          };

          return makeResult({ structured });
        } catch (err) {
          console.error("Error fetching hot articles:", err);
          return makeResult({
            structured: { error: "Failed to fetch hot articles." },
            error: true
          });
        }
      }
    );

    // Tool: 9. feeds_by_category_id
    server.tool(
      "feeds_by_category_id",
      `
      Retrieves all feeds associated with a specific category, identified by its categoryId.
      Provides a list of all feeds with details like ID, name, URL, and category.

      Note: If the agent does not know the categoryId, it must first call the "categories" tool 
      to retrieve a list of all available categories along with their corresponding categoryId.
      `,
      {
        category_id: z.string()
      },
      async ({ category_id }) => {
        console.log('[MCP Tool Called] feeds_by_category_id - category_id:', category_id);
        try {
          const feeds = await Feed.findAll({
            where: { categoryId: category_id, userId: userId },
            order: [["feedName", "ASC"]],
            raw: true
          });

          console.log("Fetched feeds:", feeds);

          return makeResult({ structured: { feeds } });
        } catch (err) {
          console.error("Error fetching feeds:", err);
          return makeResult({ structured: { error: "Failed to fetch feeds." }, error: true });
        }
      }
    );

    // Tool: 10. current_time
    server.tool(
      "current_time",
      `
      Returns the current server time as an ISO-8601 timestamp.
      This is the standard format agents typically use for time calculations.
      `,
      {},
      async () => {
        console.log('[MCP Tool Called] current_time');
        try {
          const now = new Date().toISOString();
          return makeResult({ structured: { now } });
        } catch (err) {
          console.error("Error returning current time:", err);
          return makeResult({
            structured: { error: "Failed to retrieve current server time." },
            error: true,
          });
        }
      }
    );

    // Tool: 11. crawl
    server.tool(
      "crawl",
      `
      Triggers the RSS feed crawler to fetch new articles from all active feeds.
      This will check all feeds and import new articles into the database.
      Use this when the user asks to refresh feeds, update articles, or crawl for new content.
      `,
      {},
      async () => {
        console.log('[MCP Tool Called] crawl');
        try {
          // Create mock request/response objects for the crawl controller
          const mockReq = {};
          const mockRes = {
            status: (code) => ({
              json: (data) => {
                console.log(`Crawl response: ${JSON.stringify(data)}`);
                return data;
              }
            })
          };
          const mockNext = (err) => {
            if (err) throw err;
          };

          // Call the crawlRssLinks function
          await crawlController.crawlRssLinks(mockReq, mockRes, mockNext);

          const structured = {
            success: true,
            message: "RSS feed crawling has been initiated. New articles will be fetched from all active feeds.",
            note: "The crawling process runs asynchronously. Articles should appear shortly."
          };

          return makeResult({ structured });
        } catch (err) {
          console.error("Error triggering crawl:", err);
          return makeResult({
            structured: { error: "Failed to trigger RSS crawl: " + err.message },
            error: true
          });
        }
      }
    );

    // Tool: 12. popular_tags
    server.tool(
      "popular_tags",
      `
      Returns the top 10 most popular tags for the authenticated user.
      Popularity is determined by frequency of tag usage across the user's articles.
      `,
      {},
      async () => {
        console.log('[MCP Tool Called] popular_tags');
        try {
          const popularTags = await Tag.findAll({
            where: { userId: userId },
            attributes: [
              'name',
              [fn('COUNT', col('name')), 'count']
            ],
            group: ['name'],
            order: [[literal('count'), 'DESC'], ['name', 'ASC']],
            limit: 10,
            raw: true
          });

          return makeResult({ structured: { popularTags } });
        } catch (err) {
          console.error('Error fetching popular tags:', err);
          return makeResult({ structured: { error: 'Failed to fetch popular tags.' }, error: true });
        }
      }
    );

    // Tool: 13. articles_by_tag
    server.tool(
      "articles_by_tag",
      `
      Retrieves all articles that have a specified tag (exact match on tag name).
      The agent should summarize each returned article (2–3 sentences) based on title and content.
      `,
      {
        tag: z.string().describe("The tag name to filter articles by (case-sensitive match).")
      },
      async ({ tag }) => {
        console.log('[MCP Tool Called] articles_by_tag - tag:', tag);
        try {
          // Fetch article IDs for this tag
          const tagRows = await Tag.findAll({
            where: { userId: userId, name: tag },
            attributes: ['articleId'],
            raw: true
          });

          const articleIds = tagRows.map(r => r.articleId).filter(Boolean);

          if (articleIds.length === 0) {
            return makeResult({ structured: { tag, totalArticles: 0, articles: [], htmlOutput: generateArticlesHtml([], { title: `Articles tagged '${tag}'` }) } });
          }

          const articles = await Article.findAll({
            where: { id: articleIds, userId: userId },
            order: [["createdAt", "DESC"]],
            raw: true
          });

          const html = generateArticlesHtml(articles, { title: `Articles tagged '${tag}'` });

          return makeResult({ structured: { tag, totalArticles: articles.length, htmlOutput: html, articles } });
        } catch (err) {
          console.error('Error fetching articles by tag:', err);
          return makeResult({ structured: { error: 'Failed to fetch articles by tag.' }, error: true });
        }
      }
    );

    // Tool 14: search_tag_by_keyword
    server.tool(
      "search_tag_by_keyword",
      `
      Searches for tags whose names contain the given keyword (case-insensitive substring match may depend on DB collation).
      Returns matched tag names with usage counts (number of occurrences across articles).
      `,
      {
        keyword: z.string().min(1).describe("Partial text to match inside tag names.")
      },
      async ({ keyword }) => {
        console.log('[MCP Tool Called] search_tag_by_keyword - keyword:', keyword);
        try {
          const pattern = `%${keyword}%`;
          const matches = await Tag.findAll({
            where: { userId: userId, name: { [Op.like]: pattern } },
            attributes: [
              'name',
              [fn('COUNT', col('name')), 'count']
            ],
            group: ['name'],
            order: [[literal('count'), 'DESC'], ['name', 'ASC']],
            limit: 25,
            raw: true
          });

          return makeResult({ structured: { keyword, totalMatches: matches.length, tags: matches } });
        } catch (err) {
          console.error('Error searching tags by keyword:', err);
          return makeResult({ structured: { error: 'Failed to search tags.' }, error: true });
        }
      }
    );

    // Tool 15: search_clicked_articles
    server.tool(
      "search_clicked_articles",
      `
      Retrieves all articles that have been clicked by the user (clickedInd = 1).
      The agent should summarize each returned article (2–3 sentences) based on title and content.

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.

      You may optionally provide a time window:
      - If "seconds" is provided, only articles clicked within that time window are returned.
      - If "seconds" is NOT provided, all clicked articles are returned regardless of when.

      Examples:
      - Last hour: seconds = 3600
      - Last day: seconds = 86400
      `,
      {
        feedId: z.string()
          .optional()
          .describe("Optional feedId. If omitted, articles from all feeds are included."),

        seconds: z.number()
          .min(1)
          .optional()
          .describe("Optional time window (in seconds) from the current time to look back. If omitted, all clicked articles are returned."),
      },
      async ({ feedId, seconds }) => {
        console.log('[MCP Tool Called] search_clicked_articles - feedId:', feedId, 'seconds:', seconds);
        try {
          const whereClause = {
            userId: userId,
            clickedInd: 1,
            ...(feedId ? { feedId: feedId } : {}),
          };

          // If seconds is provided, add time filter
          if (seconds) {
            const now = new Date();
            const fromTime = new Date(now.getTime() - seconds * 1000);
            whereClause.updatedAt = {
              [Op.between]: [fromTime, now],
            };
          }

          const articles = await Article.findAll({
            where: whereClause,
            order: [["updatedAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} clicked articles`);

          const html = generateArticlesHtml(articles, {
            title: 'Clicked Articles',
            emoji: '👆'
          });

          const structured = {
            totalClicked: articles.length,
            ...(seconds ? { timeWindowSeconds: seconds } : {}),
            ...(feedId ? { feedId: feedId } : {}),
            htmlOutput: html,
            articles: articles
          };

          return makeResult({ structured });
        } catch (err) {
          console.error('Error fetching clicked articles:', err);
          return makeResult({ structured: { error: 'Failed to fetch clicked articles.' }, error: true });
        }
      }
    );

    // 16. tags_clicked_articles
    //   - Returns the top 10 most used tags among articles that have been clicked (clickedInd = 1).
    //   - Useful to analyze engagement topics for the authenticated user.

    // Tool 16: tags_clicked_articles
    server.tool(
      "tags_clicked_articles",
      `
      Returns the top 10 most used tags among articles that have been clicked (clickedInd = 1)
      for the authenticated user. Useful to understand which topics users engage with most.
      `,
      async () => {
        console.log('[MCP Tool Called] tags_clicked_articles');
        try {
          // 1) Fetch clicked article IDs for this user
          const clicked = await Article.findAll({
            where: { userId: userId, clickedInd: 1 },
            attributes: ['id'],
            raw: true
          });

          const articleIds = clicked.map(r => r.id);
          if (articleIds.length === 0) {
            return makeResult({ structured: { totalClickedArticles: 0, topTags: [] } });
          }

          // 2) Aggregate tags for those articles
          const topTags = await Tag.findAll({
            where: { userId: userId, articleId: articleIds },
            attributes: [
              'name',
              [fn('COUNT', col('name')), 'count']
            ],
            group: ['name'],
            order: [[literal('count'), 'DESC'], ['name', 'ASC']],
            limit: 10,
            raw: true
          });

          return makeResult({ structured: { totalClickedArticles: articleIds.length, topTags } });
        } catch (err) {
          console.error('Error fetching clicked tags:', err);
          return makeResult({ structured: { error: 'Failed to fetch clicked tags.' }, error: true });
        }
      }
    );

    // Tool 17: category_details
    server.tool(
      "category_details",
      `
      Returns detailed information about a specific category by searching its name or using its ID.
      Includes all feeds associated with that category.
      You can search by either categoryId or categoryName (but not both at once).
      `,
      {
        categoryId: z.string()
          .optional()
          .describe("The unique identifier (ID) of the category to fetch."),
        
        categoryName: z.string()
          .optional()
          .describe("The name of the category to search for (partial match supported).")
      },
      async ({ categoryId, categoryName }) => {
        console.log('[MCP Tool Called] category_details - categoryId:', categoryId, 'categoryName:', categoryName);
        try {
          // Validate that exactly one parameter is provided
          if (!categoryId && !categoryName) {
            return makeResult({
              structured: { error: "Either categoryId or categoryName must be provided." },
              error: true
            });
          }

          if (categoryId && categoryName) {
            return makeResult({
              structured: { error: "Provide either categoryId or categoryName, not both." },
              error: true
            });
          }

          // Build where clause
          const whereClause = { userId: userId };
          if (categoryId) {
            whereClause.id = categoryId;
          } else {
            whereClause.name = { [Op.like]: `%${categoryName}%` };
          }

          // Fetch category with associated feeds
          const category = await Category.findOne({
            where: whereClause,
            include: [{
              model: Feed,
              as: 'feeds',
              required: false
            }],
            raw: false
          });

          if (!category) {
            const searchTerm = categoryId ? `ID ${categoryId}` : `name "${categoryName}"`;
            return makeResult({
              structured: { error: `No category found with ${searchTerm}.` },
              error: true
            });
          }

          // Convert to plain object for structured response
          const categoryData = category.toJSON();

          console.log(`Fetched category:`, categoryData);

          return makeResult({ 
            structured: { 
              category: categoryData,
              totalFeeds: categoryData.feeds?.length || 0
            } 
          });
        } catch (err) {
          console.error('Error fetching category details:', err);
          return makeResult({ 
            structured: { error: 'Failed to fetch category details.' }, 
            error: true 
          });
        }
      }
    );


    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
};

const getMcp = async (req, res) => {
  console.log('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
};

export default {
  postMcp,
  getMcp
}