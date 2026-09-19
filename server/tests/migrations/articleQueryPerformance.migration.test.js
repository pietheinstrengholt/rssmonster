import { afterEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260919002000-add-article-query-performance-indexes.mjs';

const qi = db.sequelize.getQueryInterface();
const tables = { articles: 'query_performance_articles', tags: 'query_performance_tags' };
// SQLite index names are database-wide, so isolate names as well as fixture tables.
const indexPrefix = 'query_perf_';
const adapter = {
  showIndex: async table => (await qi.showIndex(tables[table])).map(index => ({
    ...index,
    name: index.name.startsWith(indexPrefix) ? index.name.slice(indexPrefix.length) : index.name
  })),
  addIndex: (table, fields, options) => qi.addIndex(tables[table], fields, {
    ...options, name: `${indexPrefix}${options.name}`
  }),
  removeIndex: (table, name) => qi.removeIndex(tables[table], `${indexPrefix}${name}`)
};
const expected = {
  articles_behavior_read_idx: ['userId', 'positiveInd', 'negativeInd', 'favoriteInd', 'filteredInd', 'duplicateOfArticleId', 'lastMeaningfulReadAt', 'attentionBucket'],
  articles_user_status_visible_event_idx: ['userId', 'status', 'filteredInd', 'duplicateOfArticleId', 'eventId', 'id'],
  tags_user_article_name_idx: ['userId', 'articleId', 'name']
};

describe('Article query performance indexes', () => {
  afterEach(async () => {
    await qi.dropTable(tables.tags);
    await qi.dropTable(tables.articles);
  });

  it('adds ordered non-unique indexes, retries safely and rolls back without changing rows or existing indexes', async () => {
    const { INTEGER, STRING, DATE } = db.Sequelize;
    await qi.createTable(tables.articles, {
      id: { type: INTEGER, primaryKey: true }, userId: INTEGER, positiveInd: INTEGER,
      negativeInd: INTEGER, favoriteInd: INTEGER, filteredInd: INTEGER,
      duplicateOfArticleId: INTEGER, lastMeaningfulReadAt: DATE, attentionBucket: INTEGER,
      status: STRING, eventId: INTEGER
    });
    await qi.createTable(tables.tags, {
      id: { type: INTEGER, primaryKey: true }, userId: INTEGER, articleId: INTEGER, name: STRING
    });
    await qi.addIndex(tables.articles, ['userId', 'status'], { name: 'query_performance_existing_article_idx' });
    await qi.addIndex(tables.tags, ['articleId', 'name'], { name: 'query_performance_existing_tag_idx', unique: true });
    await qi.bulkInsert(tables.articles, [{ id: 1, userId: 2, status: 'read', filteredInd: 0 }]);
    await qi.bulkInsert(tables.tags, [{ id: 1, userId: 2, articleId: 1, name: 'News' }]);
    const rows = async () => Promise.all(Object.values(tables).map(table => qi.select(null, table, {})));
    const indexes = async () => (await Promise.all(Object.keys(tables).map(table => adapter.showIndex(table)))).flat();
    const applicationIndexes = await qi.showIndex('articles');
    const beforeRows = await rows();
    const beforeIndexes = await indexes();

    // Exercise recovery when MySQL has already committed the first index.
    await adapter.addIndex('articles', expected.articles_behavior_read_idx, { name: 'articles_behavior_read_idx' });
    await up(adapter);
    await up(adapter);
    const afterIndexes = await indexes();
    expect(afterIndexes).toHaveLength(beforeIndexes.length + 3);
    for (const [name, fields] of Object.entries(expected)) {
      const index = afterIndexes.find(index => index.name === name);
      expect(index.unique).toBe(false);
      expect(index.fields.map(field => field.attribute)).toEqual(fields);
    }
    expect(await rows()).toEqual(beforeRows);

    await down(adapter);
    await down(adapter);
    expect(await indexes()).toEqual(beforeIndexes);
    expect(await rows()).toEqual(beforeRows);
    await up(adapter);
    expect(await indexes()).toHaveLength(beforeIndexes.length + 3);
    expect(await qi.showIndex('articles')).toEqual(applicationIndexes);
  });
});
