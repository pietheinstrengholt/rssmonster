import { readdir } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { scoreArticlesFromIslandsForUser } from '../../services/score/scoreArticlesFromIslands.js';
import { computeRecommended } from '../../services/recommendations/recommendedScore.js';
import { up, down } from '../../migrations/20260914000000-remove-topics.mjs';
import { up as addInteractionClocks } from '../../migrations/20260914001000-add-article-interaction-timestamps.mjs';

import { resetDatabase } from '../helpers/resetDb.js';

const qi = db.sequelize.getQueryInterface();
const directory = new URL('../../migrations/', import.meta.url);

async function installHistoricalSchema() {
  if (db.sequelize.getDialect() === 'mysql' && db.sequelize.getDatabaseName() !== 'rssmonstertest') {
    throw new Error('Migration validation requires the isolated test database.');
  }
  if (db.sequelize.getDialect() === 'mysql') {
    const connection = await db.sequelize.connectionManager.getConnection();
    const query = sql => new Promise((resolve, reject) => connection.query(sql, error => error ? reject(error) : resolve()));
    try {
      const tables = await qi.showAllTables();
      await query('SET FOREIGN_KEY_CHECKS = 0');
      try {
        if (tables.length) await query(`DROP TABLE ${tables.map(table => qi.quoteIdentifier(table)).join(', ')}`);
      } finally {
        await query('SET FOREIGN_KEY_CHECKS = 1');
      }
    } finally {
      await db.sequelize.connectionManager.releaseConnection(connection);
    }
  } else await qi.dropAllTables();
  const names = (await readdir(directory)).filter(name => /^\d.*\.(js|mjs)$/.test(name)
    && name < '20260914000000').sort();
  for (const name of names) {
    const imported = await import(new URL(name, directory));
    await (imported.default || imported).up(qi, db.Sequelize);
  }
  // Keep the current Article model usable while isolating the historical relationship upgrade.
  await addInteractionClocks(qi, db.Sequelize);
}

const assertRemoved = async () => {
  const tables = await qi.showAllTables();
  for (const table of ['topics', 'article_topics', 'event_topics', 'island_topics']) expect(tables).not.toContain(table);
  for (const table of ['articles', 'events']) expect(await qi.describeTable(table)).not.toHaveProperty('topicId');
};

describe(`semantic schema upgrade (${db.sequelize.getDialect()})`, () => {
  afterAll(() => resetDatabase(), 120000);
  it('creates a fresh database through the complete migration history', async () => {
    await installHistoricalSchema();
    await up(qi, db.Sequelize);
    await assertRemoved();
    await db.sequelize.authenticate();
    const user = await db.User.create({ username: 'fresh-reader' });
    expect(user.id).toBeGreaterThan(0);
  }, 120000);

  it('preserves articles, Events, Islands, behavior, references and allocated IDs on upgrade', async () => {
    await installHistoricalSchema();
    const user = await db.User.create({ username: 'upgrade-reader' });
    const category = await db.Category.create({ userId: user.id, name: 'Upgrade' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Upgrade feed', url: 'https://upgrade.example/feed' });
    const article = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Database release',
      url: 'https://upgrade.example/article', publishedAt: new Date(), favoriteInd: 1, clickedAmount: 3,
      positiveInd: 1, attentionBucket: 4, articleVector: [1, 0], interestScore: 0.2 });
    const event = await db.Event.create({ userId: user.id, representativeArticleId: article.id,
      developingArticleId: article.id, name: 'Database release', eventVector: [1, 0], articleCount: 2 });
    await article.update({ eventId: event.id });
    const audit = [{ topicIds: [1], articleIds: [article.id], sourceArticles: { articles: [{ id: article.id, title: article.title }] } }];
    const island = await db.Island.create({ userId: user.id, label: 'Databases', weight: 0.5,
      islandVector: [1, 0], populationAudit: audit, positiveSignals: { stars: 1, clicks: 3, deepReads: 1 } });
    const timestamps = { createdAt: new Date(), updatedAt: new Date() };
    await qi.bulkInsert('topics', [{ id: 1, userId: user.id, name: 'Databases', topicKey: 'databases', ...timestamps }]);
    await qi.bulkUpdate('articles', { topicId: 1 }, { id: article.id });
    await qi.bulkUpdate('events', { topicId: 1 }, { id: event.id });
    await qi.bulkInsert('article_topics', [{ articleId: article.id, topicId: 1, confidence: 0.9, ...timestamps }]);
    await qi.bulkInsert('event_topics', [{ eventId: event.id, topicId: 1, confidence: 0.9, ...timestamps }]);
    await qi.bulkInsert('island_topics', [{ islandId: island.id, topicId: 1, confidence: 0.9, similarity: 0.9, ...timestamps }]);
    await db.Article.create({ id: 1000, userId: user.id, feedId: feed.id, title: 'Deleted article', publishedAt: new Date() });
    await db.Article.destroy({ where: { id: 1000 } });
    await article.reload();
    await event.reload();
    const setting = await db.Setting.create({ userId: user.id, grouping: 'topic' });
    const folder = await db.SmartFolder.create({ userId: user.id, name: 'Saved search',
      query: 'title:"grouping:topic" grouping:topic sort:recommended' });
    const jobs = await db.ProcessingJob.bulkCreate(['topic', 'event', 'island'].map(targetType => ({
      userId: user.id, type: 'semantic_label', dedupeKey: `upgrade-${targetType}`,
      payload: { userId: user.id, targetType, targetId: 1 }
    })));
    const indexesBefore = {};
    for (const table of ['articles', 'events']) {
      indexesBefore[table] = (await qi.showIndex(table)).filter(index => !index.fields.some(field => field.attribute === 'topicId'))
        .map(index => ({ unique: index.unique, fields: index.fields.map(field => field.attribute) }));
    }
    const articleBefore = { ...article.dataValues };
    const eventBefore = { ...event.dataValues };
    await up(qi, db.Sequelize);
    await assertRemoved();
    expect({ ...(await article.reload()).dataValues }).toEqual(articleBefore);
    expect({ ...(await event.reload()).dataValues }).toEqual(eventBefore);
    await island.reload();
    expect(island.islandVector).toEqual([1, 0]);
    expect(island.weight).toBe(0.5);
    expect(island.populationAudit).toEqual([{ articleIds: [article.id], sourceArticles: audit[0].sourceArticles }]);
    expect(await db.Feed.count({ where: { id: feed.id, userId: user.id } })).toBe(1);
    const next = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Next article', publishedAt: new Date() });
    expect(next.id).toBeGreaterThan(1000);
    expect((await setting.reload()).grouping).toBe('event');
    expect((await folder.reload()).query).toBe('title:"grouping:topic" grouping:event sort:recommended');
    expect(await db.ProcessingJob.findByPk(jobs[0].id)).toBeNull();
    expect(await db.ProcessingJob.count({ where: { userId: user.id } })).toBe(2);
    for (const table of ['articles', 'events']) {
      const indexes = (await qi.showIndex(table)).map(index => ({ unique: index.unique, fields: index.fields.map(field => field.attribute) }));
      expect(indexes).toEqual(expect.arrayContaining(indexesBefore[table]));
    }
    await scoreArticlesFromIslandsForUser(user.id);
    await article.reload();
    expect(article.interestScore).toBeGreaterThan(0);
    expect(Number.isFinite(computeRecommended(article))).toBe(true);
    expect(article.eventId).toBe(event.id);
    expect(article.favoriteInd).toBe(1);
    await expect(db.Article.create({ userId: user.id, feedId: 999999,
      title: 'Invalid reference', publishedAt: new Date() })).rejects.toThrow();
    await expect(down(qi)).rejects.toThrow('cannot be reconstructed');
    await db.sequelize.authenticate();
  }, 120000);
});
