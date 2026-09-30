import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import actionController from '../../controllers/action.js';

const owners = [];
const createOwner = async () => {
  const user = await db.User.create({ username: `preview-${crypto.randomUUID()}`, password: 'test-password', feverCredentialHash: crypto.randomUUID() });
  owners.push(user.id);
  const category = await db.Category.create({ userId: user.id, name: 'Preview' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Preview feed', url: `https://example.test/${user.id}` });
  return { userId: user.id, feedId: feed.id };
};
const preview = async (userId, regularExpression) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await actionController.previewAction({ userData: { userId }, body: { regularExpression } }, res, next);
  expect(next).not.toHaveBeenCalled();
  return { status: res.status.mock.calls.at(-1)[0], body: res.json.mock.calls[0][0] };
};
afterEach(async () => { await db.User.destroy({ where: { id: owners.splice(0) } }); });

describe('read-only action preview', () => {
  it('matches literal punctuation across article fields without exposing other users or changing articles', async () => {
    const owner = await createOwner();
    const other = await createOwner();
    const rows = await db.Article.bulkCreate([
      { ...owner, title: 'Learn C++', status: 'unread' },
      { ...owner, title: 'Body match', contentText: 'A c++ guide', status: 'unread' },
      { ...owner, title: 'No match', contentText: 'A C language guide', status: 'unread' },
      { ...owner, title: 'Hidden C++', filteredInd: true },
      { ...other, title: 'Private C++' }
    ]);
    const response = await preview(owner.userId, '/C\\+\\+/i');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ checked: 3, matched: 2, sampleLimit: 100 });
    expect(response.body.articles.map(article => article.title).sort()).toEqual(['Body match', 'Learn C++']);
    expect(await db.Action.count({ where: { userId: owner.userId } })).toBe(0);
    expect((await rows[0].reload()).status).toBe('unread');
    expect(rows[0].favoriteInd).toBe(0);
  });

  it('bounds the sample and displayed results, and resets global regex state between fields', async () => {
    const owner = await createOwner();
    await db.Article.bulkCreate(Array.from({ length: 101 }, (_, index) => ({ ...owner, title: `Article ${index}`, contentText: 'body only', publishedAt: new Date() })));
    const response = await preview(owner.userId, '/^body only$/g');
    expect(response.body).toMatchObject({ checked: 100, matched: 100 });
    expect(response.body.articles).toHaveLength(10);
  });

  it('returns an empty sample and actionable validation errors', async () => {
    const owner = await createOwner();
    expect((await preview(owner.userId, '/nothing/i')).body).toMatchObject({ checked: 0, matched: 0, articles: [] });
    expect((await preview(owner.userId, '/[/i')).status).toBe(400);
    expect((await preview(owner.userId, '')).status).toBe(400);
    expect((await preview(null, 'test')).status).toBe(401);
  });

  it('stops pathological expressions and remains available for another preview', async () => {
    const owner = await createOwner();
    await db.Article.create({ ...owner, title: 'Long article', contentText: `${'a'.repeat(10000)}!` });
    const result = await preview(owner.userId, '/(a+)+$/');
    expect(result).toMatchObject({ status: 422 });
    expect(result.body.error).toContain('simpler regular expression');
    expect((await preview(owner.userId, '/Long/i')).body.matched).toBe(1);
  });
});
