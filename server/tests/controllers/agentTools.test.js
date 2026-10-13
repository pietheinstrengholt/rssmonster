import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { createAgentToolToken, requireAgentToolToken } from '../../services/agent/toolAuthentication.js';
import { postAgentTool } from '../../controllers/agentTools.js';
import { createRssMonsterToolRegistry } from '../../services/agent/rssMonsterAgentTools.js';
import { getJwtSecret } from '../../config/auth.js';

const app = express();
app.use(express.json());
app.post('/tools', requireAgentToolToken, postAgentTool);
let owner;
let other;
const call = (token, name, input = {}) => request(app).post('/tools')
  .set('Authorization', `Bearer ${token}`).send({ name, input });
const tokenFor = (user, tools = ['current_time', 'search_feed_by_name']) => createAgentToolToken({ userId: user.id }, tools);

describe('authenticated agent tool callbacks', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    owner = await db.User.create({ username: `agent-owner-${randomUUID()}` });
    other = await db.User.create({ username: `agent-other-${randomUUID()}` });
  });

  it('exports serializable schemas for all shared tools and validates input on the server', async () => {
    const registry = createRssMonsterToolRegistry(owner.id);
    expect(JSON.parse(JSON.stringify(registry.definitions))).toHaveLength(19);
    const result = await call(tokenFor(owner), 'current_time');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ result: { ok: true, data: { now: expect.any(String) } } });
    expect((await call(tokenFor(owner), 'current_time', { userId: other.id })).status).toBe(400);
    expect((await call(tokenFor(owner), 'search_feed_by_name', { feedName: 123 })).status).toBe(400);
  });

  it('keeps database results scoped to the token owner', async () => {
    const ownerCategory = await db.Category.create({ userId: owner.id, name: 'Owner' });
    const otherCategory = await db.Category.create({ userId: other.id, name: 'Other' });
    await db.Feed.bulkCreate([
      { userId: owner.id, categoryId: ownerCategory.id, feedName: 'Owner news', url: 'https://owner.example/rss' },
      { userId: other.id, categoryId: otherCategory.id, feedName: 'Private news', url: 'https://other.example/rss' }
    ]);
    const result = await call(tokenFor(owner), 'search_feed_by_name', { feedName: 'news' });
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).toContain('Owner news');
    expect(JSON.stringify(result.body)).not.toContain('Private news');
  });

  it('rejects normal login tokens and prevents callback tokens from becoming login tokens', async () => {
    const normal = jwt.sign({ userId: owner.id }, getJwtSecret());
    expect((await call(normal, 'current_time')).status).toBe(401);
    expect(() => jwt.verify(tokenFor(owner), getJwtSecret())).toThrow();
    expect((await request(app).post('/tools').send({ name: 'current_time' })).status).toBe(401);
  });

  it('rejects expired, tampered and out-of-scope tokens', async () => {
    const token = tokenFor(owner, ['current_time']);
    expect((await call(token, 'crawl')).status).toBe(403);
    expect((await call(token.slice(0, -5) + 'xxxxx', 'current_time')).status).toBe(401);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 301_000);
      expect((await call(token, 'current_time')).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidates callbacks after password changes or account deletion', async () => {
    const token = tokenFor(owner);
    await owner.update({ passwordChangedAt: new Date() });
    expect((await call(token, 'current_time')).status).toBe(401);
    const otherToken = tokenFor(other);
    await other.destroy();
    expect((await call(otherToken, 'current_time')).status).toBe(401);
  });

  it('rejects unknown tool names without executing a handler', async () => {
    expect((await call(tokenFor(owner, ['unknown']), 'unknown')).status).toBe(404);
  });
});
