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
      html += `${emoji ? emoji + ' ' : ''}<a target="_blank" href="${article.url || '#'}">${article.subject || 'No Subject'}</a>`;
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
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return res.status(401).json({ error: "Missing x-user-id header for authentication" });
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
      - Searches for articles containing a specific keyword in the subject or content.
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

    Important Notes for the Agent:
    - You are allowed and encouraged to **use multiple tools together** to obtain the required results.
      For example, to get all articles from feeds in a specific category:
        1) Call feeds_by_category_id to get all feeds in that category.
        2) Call articles_by_feed_id for each feed to get their articles.
      Or to get articles from a feed by name:
        1) Call feeds to find the feedId.
        2) Call articles_by_feed_id with the obtained feedId.
    - For all article-related tools, always provide summaries of each article's content to the user.
    - Structured data from each tool is returned in structuredContent, but you may also use the textual fallback for communication.
    - Follow these guidelines to combine results and ensure all relevant information is provided in a structured and user-friendly way.
      `
    });

    // Tool: 1. categories
    server.tool(
      "categories",
      "Provides a list of all categories with details like ID, name, description, and order.",
      async () => {
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
      "Searches for a feed by its name and returns detailed information about the feed.",
      {
        feed_name: z.string()
      },
      async ({ feed_name }) => {
        try {
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

    // Tool: 4. search_articles_by_keyword
    server.tool(
      "search_articles_by_keyword",
      `
      Searches for articles containing a specific keyword in the subject or content.
      The agent must summarize each article in the results (e.g., 2–3 sentence summaries 
      based on the article title, subject, and content).

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.
      
      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".
      `,
      {
        search: z.string().describe("Keyword to search for in the article subject or content."),

        feedId: z.string()
          .optional()
          .describe("Optional feedId. If omitted, articles from all feeds are included."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),
      },
      async ({ search, feedId, status }) => {
        try {
          const articles = await Article.findAll({
            where: {
              userId: userId,
              status: status,
              ...(feedId ? { feedId: feedId } : {}),
              [Op.or]: [
                { subject: { [Op.like]: `%${search}%` } },
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

    // Tool: 6. articles_by_feed_id
    server.tool(
      "articles_by_feed_id",
      `
      Retrieves all articles associated with a specific feed, identified by its feedId.
      The agent should summarize each article returned in the results 
      (e.g., a 2–3 sentence summary based on title, subject, and content).
      
      Note: If the agent does not know the feedId, it must first call the "feeds" tool 
      to retrieve a list of all available feeds along with their corresponding feedIds.

      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".
      `,
      {
        feedId: z.number().describe("The unique identifier (ID) of the feed to fetch articles for."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),
      },
      async ({ feedId, status }) => {
        try {
          const feed = await Feed.findOne({ where: { id: feedId, userId: userId }, raw: true });
          if (!feed) {
            return makeResult({
              structured: { error: `No feed found with ID ${feedId}.` },
              error: true,
            });
          }

          const articles = await Article.findAll({
            where: { feedId, userId: userId, status: status },
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
      Retrieves all articles that are marked as favorites (where status = "star").
      The agent must summarize each article returned in the results (e.g., a 2–3 sentence summary).

      You may optionally provide a feedId:
      - If "feedId" is provided, only articles from that feed are returned.
      - If "feedId" is NOT provided, articles from ALL feeds are returned.

      You may optionally provide a status:
      - If "status" is provided, only articles with that status are returned.
      - If "status" is NOT provided, defaults to "unread".
      `,
      {
        feedId: z.string()
          .optional()
          .describe("Optional feedId. If omitted, articles from all feeds are included."),

        status: z.enum(["read", "unread"])
          .default("unread")
          .describe("Filter by read/unread status. Defaults to 'unread'."),
      },
      async ({ feedId, status }) => {
        try {
          const articles = await Article.findAll({
            where: { starInd: 1, userId: userId, status: status, ...(feedId ? { feedId: feedId } : {}) },
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