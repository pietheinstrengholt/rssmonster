import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Category from "../models/category.js";
import Feed from "../models/feed.js";
import Article from "../models/article.js";
import { Op } from 'sequelize';
import cache from "../util/cache.js";
import crawlController from "./crawl.js";

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

const postMcp = async (req, res) => {
  try {
    const server = new McpServer({
      name: "mcp-rssmonster-server",
      version: "1.0.0",
      instructions: `
    You have access to the following tools:

    1. categories
      - Provides a list of all categories with details like ID, name, description, and order.
      - Use this to explore or filter content by category.

    2. get_feeds
      - Returns a list of all feeds along with their feedIds and metadata.
      - Use this if you need to find feedIds before fetching articles.

    3. get_feed
      - Returns detailed information about a specific feed using its name.
      - Useful to get metadata for a single feed before querying its articles.

    4. search_articles_by_keyword
      - Searches for articles containing a specific keyword in the subject or content.
      - The agent must summarize each article in the results.
      - Use this when the user wants content on a specific topic.

    5. search_articles_by_time
      - Searches for articles created within a given time window (in seconds) from now.
      - The agent must summarize each article returned.
      - Example: To fetch articles from the last hour, set seconds = 3600.

    6. get_articles_by_feed_id
      - Retrieves all articles for a specific feed using feedId.
      - The agent must summarize each article returned.
      - If the feedId is unknown, first use get_feeds to obtain all feedIds.

    7. get_favorite_articles
      - Returns all articles where status = "star".  
      - You MUST summarize each returned article.

    8. get_hot_articles
      - Returns all articles considered “hot”, based on an internal cache of URLs.  
      - Does not require a search term.  
      - You MUST summarize each article.

    9. get_feeds_by_category_id
      - Retrieves all feeds associated with a specific category, identified by its categoryId.
      - Provides a list of all feeds with details like ID, name, URL, and category.

    10. get_current_time
      - Returns the current server time as an ISO-8601 timestamp.
      - This is the standard format agents typically use for time calculations.

    11. crawl
      - Triggers the RSS feed crawler to fetch new articles from all active feeds.
      - This will check all feeds and import new articles into the database.
      - Use this when the user asks to refresh feeds, update articles, or crawl for new content.

    Important Notes for the Agent:
    - You are allowed and encouraged to **use multiple tools together** to obtain the required results.
      For example, to get articles from a feed by name:
        1) Call get_feeds to find the feedId.
        2) Call get_articles_by_feed with the obtained feedId.
    - For all article-related tools, always provide summaries of each article's content to the user.
    - Structured data from each tool is returned in structuredContent, but you may also use the textual fallback for communication.
    - Follow these guidelines to combine results and ensure all relevant information is provided in a structured and user-friendly way.
      `
    });

    // Tool: search_articles_by_keyword
    server.tool(
      "search_articles_by_keyword",
      `
      Searches for articles containing a specific keyword in the subject or content.
      The agent must summarize each article in the results (e.g., 2–3 sentence summaries 
      based on the article title, subject, and content).
      `,
      {
        search: z.string().describe("Keyword to search for in the article subject or content."),
      },
      async ({ search }, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
          console.log('userId:', userId);
          const articles = await Article.findAll({
            where: {
              userId: userId,
              [Op.or]: [
                { subject: { [Op.like]: `%${search}%` } },
                { content: { [Op.like]: `%${search}%` } },
              ],
            },
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} articles for search "${search}"`);

          let html = `<h3>Search Results for "${search}"</h3>`;
          html += `<p>Found <strong>${articles.length}</strong> article(s) matching your search.</p>`;
          
          if (articles.length > 0) {
            html += '<div class="articles">';
            articles.forEach(article => {
              html += '<div class="article" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">';
              html += `<h4><a href="${article.url || '#'}" target="_blank">${article.subject || 'No Subject'}</a></h4>`;
              if (article.author) html += `<p><em>By ${article.author}</em></p>`;
              html += `<p><small>Created: ${new Date(article.createdAt).toLocaleString()}</small></p>`;
              const snippet = article.content?.replace(/<[^>]*>/g, '').slice(0, 300) || "";
              if (snippet) html += `<p>${snippet}${article.content?.length > 300 ? '...' : ''}</p>`;
              html += '</div>';
            });
            html += '</div>';
          } else {
            html += '<p><em>No articles found.</em></p>';
          }

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

    // Tool: get_articles_by_feed_id
    server.tool(
      "get_articles_by_feed_id",
      `
      Retrieves all articles associated with a specific feed, identified by its feedId.
      The agent should summarize each article returned in the results 
      (e.g., a 2–3 sentence summary based on title, subject, and content).
      
      Note: If the agent does not know the feedId, it should first call the "get_feeds" tool 
      to retrieve a list of all available feeds along with their corresponding feedIds.
      `,
      {
        feedId: z.number().describe("The unique identifier (ID) of the feed to fetch articles for."),
      },
      async ({ feedId }, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
          const feed = await Feed.findOne({ where: { id: feedId, userId: userId }, raw: true });
          if (!feed) {
            return makeResult({
              structured: { error: `No feed found with ID ${feedId}.` },
              error: true,
            });
          }

          const articles = await Article.findAll({
            where: { feedId, userId: userId },
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} articles for feed ID ${feedId}`);

          let html = `<h3>Articles from ${feed.feedName}</h3>`;
          html += `<p><strong>Feed:</strong> <a href="${feed.url || '#'}" target="_blank">${feed.feedName}</a></p>`;
          if (feed.feedDesc) html += `<p><em>${feed.feedDesc}</em></p>`;
          html += `<p>Total articles: <strong>${articles.length}</strong></p><br>`;
          
          if (articles.length > 0) {
            html += '<div class="articles">';
            articles.forEach(article => {
              html += '<div class="article" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">';
              html += `<h4><a href="${article.url || '#'}" target="_blank">${article.subject || 'No Subject'}</a></h4>`;
              if (article.author) html += `<p><em>By ${article.author}</em></p>`;
              html += `<p><small>Created: ${new Date(article.createdAt).toLocaleString()}</small></p>`;
              const snippet = article.content?.replace(/<[^>]*>/g, '').slice(0, 300) || "";
              if (snippet) html += `<p>${snippet}${article.content?.length > 300 ? '...' : ''}</p>`;
              html += '</div>';
            });
            html += '</div>';
          } else {
            html += '<p><em>No articles found in this feed.</em></p>';
          }

          const structured = {
            feed,
            totalArticles: articles.length,
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

    // Tool: search_articles_by_time
    server.tool(
      "search_articles_by_time",
      `
      Searches for articles created within a specified time window (in seconds) from now,
      based on the "createdAt" field.

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.

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
      },
      async ({ seconds, feedId }, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
          const now = new Date();
          const fromTime = new Date(now.getTime() - seconds * 1000);

          const articles = await Article.findAll({
            where: {
              userId: userId,
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
              subject: article.subject,
              author: article.author,
              createdAt: article.createdAt,
              contentSnippet: article.content?.slice(0, 300) || "",
              note: "The agent must summarize this article based on its title, subject, and content.",
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

    // Tool: get_feed
    server.tool(
      "get_feed",
      "Provides details about a specific feed by name.",
      {
        feed_name: z.string()
      },
      async ({ feed_name }, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
          const feed = await Feed.findOne({ where: { feedName: { [Op.like]: `%${feed_name}%` }, userId: userId }, raw: true });
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

    // Tool: get_categories
    server.tool(
      "get_categories",
      "Provides a list of all categories with details like ID, name, description, and order.",
      async (params, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
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

    // Tool: get_feeds
    server.tool(
      "get_feeds",
      "Provides a list of all feeds with details like ID, name, URL, and category.",
      async (params, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
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

    // Tool: get_feeds_by_category_id
    server.tool(
      "get_feeds_by_category_id",
      `
      Retrieves all feeds associated with a specific category, identified by its categoryId.
      Provides a list of all feeds with details like ID, name, URL, and category.
      `,
      {
        category_id: z.string()
      },
      async ({ category_id }, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
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

    // Tool: get_favorite_articles
    server.tool(
      "get_favorite_articles",
      `
      Retrieves all articles that are marked as favorites (where status = "star").
      The agent must summarize each article returned in the results (e.g., a 2–3 sentence summary).

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.      
      `,
      {
        feedId: z.string()
          .optional()
          .describe("Optional feedId. If omitted, articles from all feeds are included."),
      },
      async ({ feedId }, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
          const articles = await Article.findAll({
            where: { starInd: 1, userId: userId, ...(feedId ? { feedId: feedId } : {}) },
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} favorite (starred) articles`);

          let html = `<h3>⭐ Favorite Articles</h3>`;
          if (feedId) html += `<p>Filtered by feed ID: <strong>${feedId}</strong></p>`;
          html += `<p>Total favorites: <strong>${articles.length}</strong></p><br>`;
          
          if (articles.length > 0) {
            html += '<div class="articles">';
            articles.forEach(article => {
              html += '<div class="article" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fffbea;">';
              html += `<h4>⭐ <a href="${article.url || '#'}" target="_blank">${article.subject || 'No Subject'}</a></h4>`;
              if (article.author) html += `<p><em>By ${article.author}</em></p>`;
              html += `<p><small>Created: ${new Date(article.createdAt).toLocaleString()}</small></p>`;
              const snippet = article.content?.replace(/<[^>]*>/g, '').slice(0, 300) || "";
              if (snippet) html += `<p>${snippet}${article.content?.length > 300 ? '...' : ''}</p>`;
              html += '</div>';
            });
            html += '</div>';
          } else {
            html += '<p><em>No favorite articles yet. Star some articles to see them here!</em></p>';
          }

          const structured = {
            totalFavorites: articles.length,
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

    // Tool: get_current_time
    server.tool(
      "get_current_time",
      `
      Returns the current server time as an ISO-8601 timestamp.
      This is the standard format agents typically use for time calculations.
      `,
      {},
      async () => {
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

    // Tool: get_hot_articles
    server.tool(
      "get_hot_articles",
      `
      Retrieves all hot articles. Hot articles are determined by your internal cache
      (via cache.all()), which provides a list of URLs that should be considered hot.
      Results are sorted by the 'published' field in the requested order.

      The agent must summarize each article returned.
      `,
      {
        sort: z.enum(["ASC", "DESC"])
          .default("DESC")
          .describe("Sorting order for the 'published' field."),
      },
      async ({ sort }, context) => {
        try {
          const userId = context.requestInfo.headers["x-user-id"];
          // Retrieve list of hot article URLs or IDs from cache
          const hotArticleIds = cache.all(); // must be an array of URLs (or IDs)

          const articles = await Article.findAll({
            where: {
              url: hotArticleIds,
              userId: userId
            },
            order: [["published", sort]],
            raw: true
          });

          console.log(
            `Fetched ${articles.length} hot articles sorted=${sort}`
          );

          let html = `<h3>🔥 Hot Articles</h3>`;
          html += `<p>Total hot articles: <strong>${articles.length}</strong></p>`;
          html += `<p><small>Sorted by published date: ${sort === 'DESC' ? 'Newest first' : 'Oldest first'}</small></p><br>`;
          
          if (articles.length > 0) {
            html += '<div class="articles">';
            articles.forEach(article => {
              html += '<div class="article" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fff3f3;">';
              html += `<h4>🔥 <a href="${article.url || '#'}" target="_blank">${article.subject || 'No Subject'}</a></h4>`;
              if (article.author) html += `<p><em>By ${article.author}</em></p>`;
              html += `<p><small>Published: ${article.published ? new Date(article.published).toLocaleString() : 'N/A'}</small></p>`;
              const snippet = article.content?.replace(/<[^>]*>/g, '').slice(0, 300) || "";
              if (snippet) html += `<p>${snippet}${article.content?.length > 300 ? '...' : ''}</p>`;
              html += '</div>';
            });
            html += '</div>';
          } else {
            html += '<p><em>No hot articles at the moment.</em></p>';
          }

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

    // Tool: crawl
    server.tool(
      "crawl",
      `
      Triggers the RSS feed crawler to fetch new articles from all active feeds.
      This will check all feeds and import new articles into the database.
      Use this when the user asks to refresh feeds, update articles, or crawl for new content.
      `,
      {},
      async () => {
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