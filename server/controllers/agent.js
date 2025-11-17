import OpenAI from "openai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"

const postAgent = async (req, res) => {

    const baseUrl = new URL('http://localhost:3000/mcp'); // MCP server URL
    let client = undefined;

    try {
        // First try Streamable HTTP
        client = new Client({
            name: 'streamable-http-client',
            version: '1.0.0'
        });
        const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
        await client.connect(transport);
        console.log("Connected using Streamable HTTP transport");
    } catch (error) {
        // If that fails, fall back to SSE
        console.log("Streamable HTTP connection failed");
    }

    // 1. Load tools from MCP
    const toolListResponse = await client.listTools();
    const tools = toolListResponse.tools;
    console.log("Loaded tools from MCP:", tools);

    // 2. Convert to OpenAI format
    const openaiTools = tools.map(t => ({
        type: "function",
        function: {
        name: t.name,
        description: t.description ?? "",
        parameters: t.inputSchema ?? {
            type: "object",
            properties: {}
        }
        }
    }));

    const { messages } = req.body;

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages,
            tools: openaiTools
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