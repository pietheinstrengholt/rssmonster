import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Category from "../models/category.js";
import Feed from "../models/feed.js";
import Article from "../models/article.js";
import { Op } from 'sequelize';

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
      async ({ search }) => {
        try {
          const articles = await Article.findAll({
            where: {
              [Op.or]: [
                { subject: { [Op.like]: `%${search}%` } },
                { content: { [Op.like]: `%${search}%` } },
              ],
            },
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} articles for search "${search}"`);

          const structured = {
            searchQuery: search,
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
      async ({ feedId }) => {
        try {
          const feed = await Feed.findOne({ where: { id: feedId }, raw: true });
          if (!feed) {
            return makeResult({
              structured: { error: `No feed found with ID ${feedId}.` },
              error: true,
            });
          }

          const articles = await Article.findAll({
            where: { feedId },
            order: [["createdAt", "DESC"]],
            raw: true,
          });

          console.log(`Fetched ${articles.length} articles for feed ID ${feedId}`);

          const structured = {
            feed,
            totalArticles: articles.length,
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
      
      For example:
      - To get articles from the last hour, set "seconds" to 3600.
      - To get articles from the last day, set "seconds" to 86400.
      
      The agent should summarize each article returned in the results.
      `,
      {
        seconds: z.number()
          .min(1)
          .describe("The time range (in seconds) from the current time to look back for recent articles."),
      },
      async ({ seconds }) => {
        try {
          const now = new Date();
          const fromTime = new Date(now.getTime() - seconds * 1000);

          const articles = await Article.findAll({
            where: {
              createdAt: {
                [Op.between]: [fromTime, now],
              },
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
      async ({ feed_name }) => {
        try {
          const feed = await Feed.findOne({ where: { feedName: { [Op.like]: `%${feed_name}%` } }, raw: true });
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
      async () => {
        try {
          const categories = await Category.findAll({
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
      async () => {
        try {
          const feeds = await Feed.findAll({
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