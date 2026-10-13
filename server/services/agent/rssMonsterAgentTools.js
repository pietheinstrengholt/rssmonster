import { z } from 'zod';

import { registerRssMonsterTools } from '../../controllers/mcp.js';

// The same handlers back MCP and inference callbacks; the server owns user scope.
export const createRssMonsterToolRegistry = userId => {
  const handlers = new Map();
  const definitions = [];
  const registrar = {
    tool(name, description, schemaOrHandler, possibleHandler) {
      const hasSchema = typeof schemaOrHandler !== 'function';
      const handler = hasSchema ? possibleHandler : schemaOrHandler;
      const schema = z.object(hasSchema ? schemaOrHandler : {}).strict();
      definitions.push({ name, description, parameters: z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) });
      handlers.set(name, async input => {
        const parsed = schema.parse(input);
        const result = hasSchema ? await handler(parsed) : await handler();
        return result?.structuredContent ?? result;
      });
    }
  };

  registerRssMonsterTools(registrar, userId);
  return { definitions, handlers };
};
