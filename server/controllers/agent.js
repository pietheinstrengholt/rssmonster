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
      name: "RSS feeds management and retrieval assistant",
      instructions: `
        You are an autonomous RSS feeds management and retrieval assistant. Your goal is to provide a complete answer 
        using the available MCP tools. You may call any tools provided by the MCP server 
        to obtain information. Do NOT ask the user for follow-up questions. 
        Use the tools to find the correct answer and return it directly.
        
        IMPORTANT: The MCP tools return HTML-formatted output in the 'htmlOutput' field of their structured responses.
        You MUST return this HTML content directly to the user without modification, escaping, or converting it to plain text.
        Preserve all HTML tags, links, formatting, paragraphs, and styling exactly as provided by the tools.
        
        When presenting results:
        - Use the 'htmlOutput' field from the tool response as your primary output
        - Return the HTML content as-is, maintaining all tags and structure
        - Do NOT convert HTML to markdown or plain text
        - Do NOT escape HTML entities or tags
        - Provide clear, final, and well-formatted HTML output whenever possible
            `,
      model: process.env.OPENAI_MODEL_NAME || "gpt-4.1",
      mcpServers: [mcpServer]
    });

    // 3. Fetch input - extract last user message and build chat history
    const messages = req.body.messages;
    let input = req.body.input ?? "";
    let chatHistory = [];
    
    // If messages array exists, build chat history and find the last user message
    if (Array.isArray(messages) && messages.length > 0) {
      // Build full chat history
      chatHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Find last message with role 'user'
      const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
      if (lastUserMessage) {
        input = lastUserMessage.content;
      }
    }

    // 4. Connect to MCP server, run the agent, and ensure closure
    try {
        await mcpServer.connect();
        const result = await run(agent, input, { chatHistory });
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