import { createRssMonsterToolRegistry } from '../services/agent/rssMonsterAgentTools.js';

export const postAgentTool = async (req, res) => {
  const { name, input } = req.body || {};
  const scope = req.agentToolScope;
  if (!scope.tools.includes(name)) return res.status(403).json({ error: 'Tool is not authorized' });
  const { handlers } = createRssMonsterToolRegistry(scope.userId);
  const handler = handlers.get(name);
  if (!handler) return res.status(404).json({ error: 'Unknown tool' });
  try {
    return res.json({ result: await handler(input) });
  } catch (error) {
    if (error.name === 'ZodError') return res.status(400).json({ error: 'Invalid tool input' });
    return res.status(500).json({ error: 'Tool execution failed' });
  }
};
