import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const postAgent = async (req, res) => {

    // Launch your own MCP server executable OR connect programmatically
    const mcpClient = new Client({
        transport: new StdioClientTransport("/mcp-rssmonster-server")
    });

    await mcpClient.connect()

    const toolListResponse = await mcpClient.listTools();
    
    const tools = toolListResponse.tools; // Array of MCP tool definitions

    console.log("Available MCP Tools:", tools);

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const { messages } = req.body;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages,
            tools: mcpClient.tools(), // Provide MCP tools to OpenAI
        });

        res.json(response);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

export default {
  postAgent
}