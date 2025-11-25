import { Agent, run, MCPServerStreamableHttp } from "@openai/agents";
import dotenv from "dotenv";
dotenv.config();
//set port
const port = process.env.PORT || 3000;

export const postAgent = async (req, res) => {
  try {
    // 1. Define the MCP server
    const mcpServer = new MCPServerStreamableHttp({
        url: `http://localhost:${port}/mcp`,
        name: 'mcp-rssmonster-server',
    });

    // 2. Build the agent
    const agent = new Agent({
      name: "Assistant",
      instructions: `
        You are an autonomous RSS feeds management and retrieval assistant. Your goal is to provide a complete answer 
        using the available MCP tools. You may call any tools provided by the MCP server 
        to obtain information. Do NOT ask the user for follow-up questions. 
        Use the tools to find the correct answer and return it directly. 
        Provide clear, final, and concise output whenever possible.
            `,
      model: process.env.OPENAI_MODEL_NAME || "gpt-4.1",
      mcpServers: [mcpServer]
    });

    // 3. Fetch input
    const input = req.body.messages ?? req.body.input ?? "";

    // 4. Connect to MCP server, run the agent, and ensure closure
    try {
        await mcpServer.connect();
        const result = await run(agent, input);
        return res.status(200).json({ output: result.finalOutput });
    } finally {
        await mcpServer.close();
    }
  } catch (err) {
    console.error("Agent run error:", err);
    res.status(500).json({ error: err?.message ?? String(err) });
  }
};

export default { postAgent };