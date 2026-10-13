# Assistant tool boundary

Inference owns the agent loop and model. The application server owns authentication,
bounded chat history, output sanitization, database access and the shared MCP tools.

`rssMonsterAgentTools.js` captures the MCP registrar as a serializable tool catalog
and server-only handler map. It validates every callback with the original Zod
schema, including defaults and bounds. Handlers always capture the token's user ID;
the model cannot choose ownership through arguments.

`toolAuthentication.js` issues five-minute HS256 tokens scoped to a user, password
version, audience and allowed tool names. A signing key derived from `JWT_SECRET`
separates these tokens from login tokens. Only the opaque token is passed to
inference. No secret or database client crosses the service boundary.

`POST /api/agent/tools` verifies the token and current account before running a
handler. Inference uses a fixed configured `ASSISTANT_TOOL_URL`, rejects redirects,
and propagates request cancellation. There are no automatic tool retries or
process-local session registries. Existing `/mcp` clients retain their protocol.

See [configuration and migration](../../../docs/inference.md#assistant-orchestration-and-database-tools).
