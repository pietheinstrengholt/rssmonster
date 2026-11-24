import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

let app;
beforeAll(async () => { process.env.DISABLE_LISTENER = 'true'; app = (await import('../../app.js')).default; }, 50000);

const fixture = async () => {
  const user = await db.User.create({ username: `delete-${randomUUID()}`, password: 'unused' });
  const category = await db.Category.create({ userId: user.id, name: 'Delete' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Delete', url: `https://${randomUUID()}.example/feed` });
  const article = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Deletable article', publishedAt: new Date() });
  const token = jwt.sign({ userId: user.id }, getJwtSecret());
  const del = articleId => request(app).delete(`/api/articles/${articleId}`).set('Authorization', `Bearer ${token}`);
  return { user, article, feed, del };
};

describe('DELETE /api/articles/:articleId', () => {
  it('deletes an owned article and keeps it deleted', async () => {
    const { article, del } = await fixture();

    const response = await del(article.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ message: 'Article deleted successfully' });
    expect(await db.Article.count({ where: { id: article.id } })).toBe(0);
    expect((await del(article.id)).status).toBe(404);
  });

  it('rejects a foreign-user article without deleting it', async () => {
    const owner = await fixture();
    const attacker = await fixture();

    const response = await attacker.del(owner.article.id);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'Article not found' });
    expect(await db.Article.count({ where: { id: owner.article.id } })).toBe(1);
  });

  it('repairs the Event representative pointers when deleting the representative article', async () => {
    const { user, article, feed, del } = await fixture();
    const event = await db.Event.create({ userId: user.id, name: 'Event', representativeArticleId: article.id });
    const sibling = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Sibling', eventId: event.id });
    await article.update({ eventId: event.id });

    expect((await del(article.id)).status).toBe(200);

    expect(await db.Article.count({ where: { id: article.id } })).toBe(0);
    const repairedEvent = await db.Event.findByPk(event.id);
    if (repairedEvent) expect(repairedEvent.representativeArticleId).not.toBe(article.id);
    expect(await db.Article.findByPk(sibling.id)).not.toBeNull();
  });

  it('requires authentication', async () => {
    const { article } = await fixture();
    const response = await request(app).delete(`/api/articles/${article.id}`);
    expect([401, 403]).toContain(response.status);
  });
});
