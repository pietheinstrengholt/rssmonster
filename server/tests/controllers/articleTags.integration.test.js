import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import articleRoutes from '../../routes/article.js';
import tagRoutes from '../../routes/tag.js';
import smartFolderRoutes from '../../routes/smartFolder.js';
import { replaceArticleDerivedTags } from '../../services/crawl/persistence/tags.js';

const { Article, Category, Feed, SmartFolder, Tag, User, sequelize } = db;
const app = express();
app.use(express.json());
app.use('/api/articles', articleRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/smartfolders', smartFolderRoutes);

let owner;
let foreign;
let ownerFeed;
let foreignFeed;
let article;
let source;
let foreignArticle;
let existing;
let auth;
let foreignAuth;

const authHeader = user => `Bearer ${jwt.sign({ userId: user.id }, getJwtSecret())}`;
const assign = (tags, target = article.id, authorization = auth) => request(app)
  .post(`/api/articles/${target}/tags`).set('Authorization', authorization).send({ tags });
const remove = (tagId, target = article.id, authorization = auth) => request(app)
  .delete(`/api/articles/${target}/tags/${tagId}`).set('Authorization', authorization);
const names = tags => tags.map(tag => tag.name);

describe('manual article tagging API', () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const setup = async prefix => {
      const user = await User.create({
        username: `${prefix}-${suffix}`, password: 'test', feverCredentialHash: `${prefix}-${suffix}`
      });
      const category = await Category.create({ userId: user.id, name: 'Tags' });
      const feed = await Feed.create({
        userId: user.id, categoryId: category.id, feedName: 'Tags', url: `https://example.com/${user.id}`
      });
      return { user, feed };
    };
    ({ user: owner, feed: ownerFeed } = await setup('manual-tags-owner'));
    ({ user: foreign, feed: foreignFeed } = await setup('manual-tags-foreign'));
    auth = authHeader(owner);
    foreignAuth = authHeader(foreign);
  });

  beforeEach(async () => {
    const createArticle = (user, feed, title) => Article.create({
      userId: user.id, feedId: feed.id, title, status: 'unread', publishedAt: new Date()
    });
    article = await createArticle(owner, ownerFeed, 'Target');
    source = await createArticle(owner, ownerFeed, 'Source');
    foreignArticle = await createArticle(foreign, foreignFeed, 'Foreign');
    existing = await Tag.create({ articleId: source.id, userId: owner.id, name: 'existing', tagType: 'rule' });
  });

  afterEach(async () => {
    await SmartFolder.destroy({ where: { userId: owner.id } });
    await Article.destroy({ where: { id: [article.id, source.id, foreignArticle.id] } });
  });

  it('lists distinct user-owned names across statuses without changing the Top Tags default', async () => {
    await source.update({ status: 'read' });
    await Tag.create({ articleId: article.id, userId: owner.id, name: 'existing', tagType: 'feed' });
    await Tag.create({ articleId: foreignArticle.id, userId: foreign.id, name: 'foreign' });
    // Separate foreign keys permit inconsistent ownership; never expose such rows.
    await Tag.create({ articleId: article.id, userId: foreign.id, name: 'wrong-owner' });
    await Tag.create({ articleId: foreignArticle.id, userId: owner.id, name: 'wrong-article' });
    const all = await request(app).get('/api/tags?scope=all').set('Authorization', auth);
    expect(all.status).toBe(200);
    expect(all.body).toEqual({ tags: [{ name: 'existing' }], hasMore: false });
    const top = await request(app).get('/api/tags').set('Authorization', auth);
    expect(top.status).toBe(200);
    expect(top.body.tags.map(tag => ({ ...tag, count: Number(tag.count) }))).toEqual([{ name: 'existing', count: 1 }]);
  });

  it('paginates names alphabetically', async () => {
    await assign(['alpha', 'zulu']);
    const first = await request(app).get('/api/tags?scope=all&limit=2').set('Authorization', auth);
    expect(first.body).toEqual({ tags: [{ name: 'alpha' }, { name: 'existing' }], hasMore: true });
    const second = await request(app).get('/api/tags?scope=all&limit=2&offset=2').set('Authorization', auth);
    expect(second.body).toEqual({ tags: [{ name: 'zulu' }], hasMore: false });
  });

  it('searches normalized names with a bounded deterministic result and exact match first', async () => {
    await assign(['serverless', 'ver', 'versioning', 'verstappen', 'unrelated']);
    const first = await request(app).get('/api/tags').query({ search: ' VER ', limit: 2 }).set('Authorization', auth);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ tags: [{ name: 'ver' }, { name: 'serverless' }], hasMore: true });
    const repeated = await request(app).get('/api/tags').query({ scope: 'all', search: 'ver', limit: 2 }).set('Authorization', auth);
    expect(repeated.body).toEqual(first.body);
    const absent = await request(app).get('/api/tags').query({ search: 'not-present' }).set('Authorization', auth);
    expect(absent.body).toEqual({ tags: [], hasMore: false });
  });

  it('never returns other users or inconsistently owned tag rows in search', async () => {
    await assign(['private-own']);
    await Tag.bulkCreate([
      { articleId: foreignArticle.id, userId: foreign.id, name: 'private-foreign' },
      { articleId: article.id, userId: foreign.id, name: 'private-wrong-owner' },
      { articleId: foreignArticle.id, userId: owner.id, name: 'private-wrong-article' }
    ]);
    const response = await request(app).get('/api/tags').query({ search: 'private' }).set('Authorization', auth);
    expect(response.body.tags).toEqual([{ name: 'private-own' }]);
  });

  it('defaults typeahead to 20 names and caps it at 50 without returning the catalogue', async () => {
    await assign(Array.from({ length: 80 }, (_, index) => `match-${String(index).padStart(2, '0')}`));
    const response = await request(app).get('/api/tags').query({ search: 'match' }).set('Authorization', auth);
    expect(response.body.tags).toHaveLength(20);
    expect(response.body.hasMore).toBe(true);
    const maximum = await request(app).get('/api/tags').query({ search: 'match', limit: 50 }).set('Authorization', auth);
    expect(maximum.body.tags).toHaveLength(50);
    expect((await request(app).get('/api/tags').query({ search: 'match', limit: 51 }).set('Authorization', auth)).status).toBe(400);
  });

  it('matches literal query punctuation without wildcards or SQL interpolation', async () => {
    await assign(['100%_safe', '100xxsafe', "quote';drop"]);
    const wildcard = await request(app).get('/api/tags').query({ search: '%_' }).set('Authorization', auth);
    expect(wildcard.body.tags).toEqual([{ name: '100%_safe' }]);
    const punctuation = await request(app).get('/api/tags').query({ search: "quote';" }).set('Authorization', auth);
    expect(punctuation.body.tags).toEqual([{ name: "quote';drop" }]);
  });

  it('rejects invalid typeahead parameters', async () => {
    expect((await request(app).get('/api/tags').query({ search: 'x'.repeat(256) }).set('Authorization', auth)).status).toBe(400);
    expect((await request(app).get('/api/tags?search=one&search=two').set('Authorization', auth)).status).toBe(400);
  });

  it('assigns an existing name without modifying its other article assignment', async () => {
    const response = await assign(['existing']);
    expect(response.status).toBe(200);
    expect(response.body.tags).toEqual([{ id: expect.any(Number), name: 'existing', tagType: 'manual' }]);
    expect(await Tag.findByPk(existing.id)).toMatchObject({ articleId: source.id, tagType: 'rule' });
  });

  it('creates and assigns multiple normalized names, including multiword labels', async () => {
    const response = await assign([' New Tag ', 'SECURITY', 'existing']);
    expect(response.status).toBe(200);
    expect(names(response.body.tags)).toEqual(['new tag', 'security', 'existing']);
    expect(response.body.tags.every(tag => tag.tagType === 'manual')).toBe(true);
    expect(await Tag.count({ where: { articleId: article.id, userId: owner.id } })).toBe(3);
  });

  it('makes repeated and case-varied assignments idempotent', async () => {
    const first = await assign([' Existing ', 'existing', 'EXISTING']);
    const second = await assign(['EXISTING']);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await Tag.count({ where: { articleId: article.id } })).toBe(1);
  });

  it('serializes concurrent assignments without duplicating associations', async () => {
    const responses = await Promise.all([assign(['existing']), assign(['EXISTING'])]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(await Tag.count({ where: { articleId: article.id } })).toBe(1);
  });

  it('preserves existing automatic provenance and unrelated tags', async () => {
    const rule = await Tag.create({ articleId: article.id, userId: owner.id, name: 'existing', tagType: 'rule' });
    await Tag.create({ articleId: article.id, userId: owner.id, name: 'publisher', tagType: 'provider' });
    const response = await assign(['EXISTING', 'new']);
    expect(response.status).toBe(200);
    expect(names(response.body.tags)).toEqual(['existing', 'publisher', 'new']);
    expect(response.body.tags[0]).toEqual({ id: rule.id, name: 'existing', tagType: 'rule' });
  });

  it('preserves newly assigned manual tags during derived-tag reconciliation', async () => {
    const response = await assign(['existing']);
    await sequelize.transaction(transaction => replaceArticleDerivedTags({
      articleId: article.id, userId: owner.id, ruleTags: ['existing', 'rule'], transaction
    }));
    expect(await Tag.findByPk(response.body.tags[0].id)).toMatchObject({ name: 'existing', tagType: 'manual' });
    expect(await Tag.count({ where: { articleId: article.id, name: 'existing' } })).toBe(1);
  });

  it('removes only the selected association and returns remaining tags', async () => {
    const added = await assign(['existing', 'keep']);
    const response = await remove(added.body.tags[0].id);
    expect(response.status).toBe(200);
    expect(names(response.body.tags)).toEqual(['keep']);
    expect(await Tag.findByPk(added.body.tags[0].id)).toBeNull();
    expect(await Tag.findByPk(existing.id)).not.toBeNull();
  });

  it('allows explicit removal of a rule assignment without touching other articles', async () => {
    const rule = await Tag.create({ articleId: article.id, userId: owner.id, name: 'existing', tagType: 'rule' });
    const response = await remove(rule.id);
    expect(response.status).toBe(200);
    expect(response.body.tags).toEqual([]);
    expect(await Tag.findByPk(existing.id)).not.toBeNull();
  });

  it('returns current tags through the existing article detail APIs with owner isolation', async () => {
    const added = await assign(['existing', 'new']);
    await Tag.create({ articleId: article.id, userId: foreign.id, name: 'foreign-row' });
    const single = await request(app).get(`/api/articles/${article.id}`).set('Authorization', auth);
    expect(single.status).toBe(200);
    expect(single.body.article.tags).toEqual(added.body.tags);
    const batch = await request(app).post('/api/articles/details').set('Authorization', auth)
      .send({ articleIds: String(article.id), sort: 'desc' });
    expect(batch.status).toBe(200);
    expect(batch.body[0].tags).toEqual(added.body.tags);
    const empty = await request(app).get(`/api/articles/${foreignArticle.id}`).set('Authorization', foreignAuth);
    expect(empty.body.article.tags).toEqual([]);
  });

  it('immediately changes search membership and Smart Folder counts', async () => {
    const folder = await SmartFolder.create({ userId: owner.id, name: 'Manual', query: 'tag:manual', limitCount: 50 });
    const search = () => request(app).get('/api/articles?search=tag:manual&persistSettings=false').set('Authorization', auth);
    const counts = () => request(app).get('/api/smartfolders/counts').set('Authorization', auth);
    const added = await assign(['manual']);
    const matching = await search();
    expect(matching.status).toBe(200);
    expect(matching.body.itemIds).toContain(article.id);
    expect((await counts()).body.smartFolders).toContainEqual({ id: folder.id, ArticleCount: 1 });
    await remove(added.body.tags[0].id);
    expect((await search()).body.itemIds).not.toContain(article.id);
    expect((await counts()).body.smartFolders).toContainEqual({ id: folder.id, ArticleCount: 0 });
  });

  it('matches multiword tags through sidebar selection, quoted search and Smart Folders', async () => {
    const added = await assign([' Read Later ']);
    const search = expression => request(app).get('/api/articles').query({
      search: expression, persistSettings: false
    }).set('Authorization', auth);
    expect((await search('tag:"READ LATER"')).body.itemIds).toContain(article.id);
    const sidebar = await request(app).get('/api/articles').query({
      tag: 'read later', persistSettings: false
    }).set('Authorization', auth);
    expect(sidebar.body.itemIds).toContain(article.id);
    const folder = await SmartFolder.create({ userId: owner.id, name: 'Read later', query: 'tag:"read later"', limitCount: 50 });
    const counts = () => request(app).get('/api/smartfolders/counts').set('Authorization', auth);
    expect((await counts()).body.smartFolders).toContainEqual({ id: folder.id, ArticleCount: 1 });
    const top = await request(app).get('/api/tags').set('Authorization', auth);
    expect(top.body.tags).toContainEqual({ name: 'read later', count: 1 });
    await remove(added.body.tags[0].id);
    expect((await counts()).body.smartFolders).toContainEqual({ id: folder.id, ArticleCount: 0 });
    expect((await request(app).get('/api/tags').set('Authorization', auth)).body.tags.map(tag => tag.name)).not.toContain('read later');
  });

  it('accepts a full batch and preserves automatic assignments on repeated saves', async () => {
    await Tag.create({ articleId: article.id, userId: owner.id, name: 'topic-0', tagType: 'rule' });
    const labels = Array.from({ length: 100 }, (_, index) => `topic-${index}`);
    expect((await assign(labels)).status).toBe(200);
    const repeated = await assign(labels);
    expect(repeated.status).toBe(200);
    expect(repeated.body.tags).toHaveLength(100);
    expect(repeated.body.tags.find(tag => tag.name === 'topic-0').tagType).toBe('rule');
  });

  it('accepts the maximum normalized name length', async () => {
    const name = 'x'.repeat(255);
    const response = await assign([` ${name} `]);
    expect(response.status).toBe(200);
    expect(names(response.body.tags)).toEqual([name]);
  });

  it('matches quoted labels containing commas, quotes and backslashes', async () => {
    const name = 'a,"b\\c';
    await assign([name]);
    const search = `tag:"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
    const response = await request(app).get('/api/articles').query({ search, persistSettings: false }).set('Authorization', auth);
    expect(response.body.itemIds).toContain(article.id);
    const folder = await SmartFolder.create({ userId: owner.id, name: 'Punctuation', query: search, limitCount: 50 });
    const counts = await request(app).get('/api/smartfolders/counts').set('Authorization', auth);
    expect(counts.body.smartFolders).toContainEqual({ id: folder.id, ArticleCount: 1 });
  });

  it('rejects cross-user articles and tag assignments', async () => {
    const foreignTag = await Tag.create({ articleId: foreignArticle.id, userId: foreign.id, name: 'private' });
    expect((await assign(['new'], foreignArticle.id)).status).toBe(404);
    expect((await assign(['new'], article.id, foreignAuth)).status).toBe(404);
    expect((await remove(foreignTag.id, foreignArticle.id)).status).toBe(404);
    expect((await remove(foreignTag.id)).status).toBe(404);
    expect((await remove(existing.id)).status).toBe(404);
    expect((await request(app).get(`/api/articles/${article.id}`).set('Authorization', foreignAuth)).status).toBe(404);
    expect(await Tag.findByPk(foreignTag.id)).not.toBeNull();
    expect(await Tag.findByPk(existing.id)).not.toBeNull();
  });

  it('rejects a foreign-owned tag attached to the current article', async () => {
    const tag = await Tag.create({ articleId: article.id, userId: foreign.id, name: 'foreign-row' });
    expect((await remove(tag.id)).status).toBe(404);
    expect(await Tag.findByPk(tag.id)).not.toBeNull();
  });

  it('requires authentication using the existing middleware contract', async () => {
    expect((await request(app).get('/api/tags?scope=all')).status).toBe(400);
    expect((await request(app).post(`/api/articles/${article.id}/tags`).send({ tags: ['new'] })).status).toBe(400);
    expect((await request(app).delete(`/api/articles/${article.id}/tags/${existing.id}`)).status).toBe(400);
    const missingUser = `Bearer ${jwt.sign({}, getJwtSecret())}`;
    expect((await assign(['new'], article.id, missingUser)).status).toBe(401);
    expect((await remove(existing.id, article.id, missingUser)).status).toBe(401);
    expect((await request(app).get('/api/tags?scope=all').set('Authorization', missingUser)).status).toBe(401);
  });

  it.each(['invalid', '0', '-1', '1.5', '9007199254740992'])('rejects malformed article/tag ID %s', async id => {
    expect((await assign(['new'], id)).status).toBe(400);
    expect((await remove(id)).status).toBe(400);
    expect((await remove(existing.id, id)).status).toBe(400);
  });

  it('returns 404 for nonexistent IDs and invisible articles', async () => {
    expect((await assign(['new'], 2147483647)).status).toBe(404);
    expect((await remove(2147483647)).status).toBe(404);
    await article.update({ filteredInd: true });
    expect((await assign(['new'])).status).toBe(404);
    expect((await remove(existing.id)).status).toBe(404);
    await article.update({ filteredInd: false, duplicateOfArticleId: source.id });
    expect((await assign(['new'])).status).toBe(404);
  });

  it.each([undefined, [], 'tag', [1], [null], [''], ['   '], ['valid', ''], ['x'.repeat(256)], Array(101).fill('tag')])(
    'rejects invalid tag payload %# atomically', async tags => {
      expect((await assign(tags)).status).toBe(400);
      expect(await Tag.count({ where: { articleId: article.id } })).toBe(0);
    }
  );

  it.each(['limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=invalid', 'offset=9007199254740992'])(
    'rejects invalid list pagination %s', async query => {
      const response = await request(app).get(`/api/tags?scope=all&${query}`).set('Authorization', auth);
      expect(response.status).toBe(400);
    }
  );
});
