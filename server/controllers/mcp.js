import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Category from "../models/category.js";
import Feed from "../models/feed.js";

const postMcp = async (req, res) => {
  try {
    const server = new McpServer({
      name: "rss-mcp-server",
      version: "1.0.0",
      instructions: `Instructions for using these tools...`
    });

    // Register tools
    server.tool(
      "get_feed",
      {
        feed_name: z.string()
      }, async ({ feed_name }) => {
      const feed = await Feed.findOne({ where: { feedName: feed_name } });
      return {
        content: [{ type: "text", text: `Found this feed details: ${JSON.stringify(feed)}` }],
      };
    });

    // Define a dynamic resource "greeting"
    server.resource(
      "categories",
      "resource://categories",
      async () => {
        const categories = await Category.findAll({ order: ["categoryOrder", "name"] });
        console.log(JSON.stringify(categories));
        return { content: [{ type: "text", text: `Found this feed details: ${JSON.stringify(categories)}` }] };
      }
    );

    // Define a greeting prompt
    server.prompt(
      "greeting",
      {
        name: z.string(),
        time_of_day: z.enum(["morning", "afternoon", "evening", "night"])
      },
      ({ name, time_of_day }) => ({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Hello ${name}! Good ${time_of_day}. How are you today?`
          }
        }]
      })
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