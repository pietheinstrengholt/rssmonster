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
      instructions: `Instructions for using these tools...`
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

const getMcp = async  (req, res) => {
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