import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import db from '../../models/index.js';
import { postAgent } from '../../controllers/agent.js';
import { postAgentTool } from '../../controllers/agentTools.js';
import { requireAgentToolToken } from '../../services/agent/toolAuthentication.js';

const listen = async app => {
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  return listener;
};
const url = listener => `http://127.0.0.1:${listener.address().port}`;
const close = listener => new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));

describe('server and inference agent boundary', () => {
  it('streams an inference run and retrieves only the authenticated user data', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = await db.User.create({ username: `boundary-${randomUUID()}` });
    const other = await db.User.create({ username: `boundary-other-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'Owner' });
    const otherCategory = await db.Category.create({ userId: other.id, name: 'Other' });
    await db.Feed.bulkCreate([
      { userId: user.id, categoryId: category.id, feedName: 'Owner news', url: 'https://owner.example/rss' },
      { userId: other.id, categoryId: otherCategory.id, feedName: 'Private news', url: 'https://other.example/rss' }
    ]);
    const serverApp = express();
    serverApp.use(express.json());
    serverApp.post('/api/agent/tools', requireAgentToolToken, postAgentTool);
    serverApp.post('/chat', (req, _res, next) => { req.userData = { userId: user.id }; next(); }, postAgent);
    const server = await listen(serverApp);
    let inference;
    try {
      const inferenceApp = express();
      inferenceApp.use(express.json({ limit: '1mb' }));
      // The external inference boundary is a protocol fixture. Its actual SDK loop
      // is tested in inference/, whose dependencies are installed independently in CI.
      inferenceApp.post('/api/assistant/run/stream', async (req, res) => {
        expect(req.headers['x-inference-api-key']).toBe('boundary-key');
        expect(req.body.tools).toHaveLength(19);
        const input = { feedName: 'news' };
        const name = 'search_feed_by_name';
        const callback = await fetch(`${url(server)}/api/agent/tools`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.body.toolToken}` },
          body: JSON.stringify({ name, input })
        });
        expect(callback.status).toBe(200);
        const { result } = await callback.json();
        expect(JSON.stringify(result)).toContain('Owner news');
        expect(JSON.stringify(result)).not.toContain('Private news');
        res.setHeader('Content-Type', 'application/x-ndjson');
        const text = '<p>Owner news</p><script>unsafe</script>';
        for (const event of [
          { type: 'tool_status', name, status: 'started' },
          { type: 'text', output: text },
          { type: 'complete', finalOutput: text, agentSetupMs: 1,
            toolResults: [{ name, input, result }], toolDurations: [{ name, durationMs: 1 }] }
        ]) res.write(`${JSON.stringify(event)}\n`);
        res.end();
      });
      inference = await listen(inferenceApp);
      vi.stubEnv('INFERENCE_BASE_URL', url(inference));
      vi.stubEnv('INFERENCE_API_KEY', 'boundary-key');
      const result = await request(serverApp).post('/chat').send({ input: 'Find news feeds' });
      expect(result.status).toBe(200);
      expect(result.text).toContain('event: tool_status');
      expect(result.text).toContain('event: history');
      expect(result.text).toContain('event: complete\ndata: {"output":"<p>Owner news</p>"}');
      expect(result.text).not.toContain('Private news');
      expect(result.text).not.toContain('boundary-key');
      expect(result.text).not.toContain('<script>');
    } finally {
      vi.unstubAllEnvs();
      if (inference) await close(inference);
      await close(server);
    }
  });
});
