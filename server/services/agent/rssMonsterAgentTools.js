import { tool } from '@openai/agents';
import { z } from 'zod';

import { registerRssMonsterTools } from '../../controllers/mcp.js';

const elapsedMs = startedAt => Math.round((performance.now() - startedAt) * 10) / 10;

// Adapts the shared MCP-style registrar to in-process Agents SDK function tools.
export const createRssMonsterAgentTools = (userId, { onToolResult, onToolTiming } = {}) => {
  const tools = [];
  const registrar = {
    tool(name, description, schemaOrHandler, possibleHandler) {
      const hasSchema = typeof schemaOrHandler !== 'function';
      const handler = hasSchema ? possibleHandler : schemaOrHandler;
      const parameters = z.object(hasSchema ? schemaOrHandler : {});

      tools.push(tool({
        name,
        description,
        parameters,
        execute: async input => {
          const startedAt = performance.now();
          try {
            const result = hasSchema ? await handler(input) : await handler();
            const structuredResult = result?.structuredContent ?? result;
            onToolResult?.({ input, name, result: structuredResult });
            return structuredResult;
          } finally {
            onToolTiming?.({ durationMs: elapsedMs(startedAt), name });
          }
        }
      }));
    }
  };

  registerRssMonsterTools(registrar, userId);
  return tools;
};
