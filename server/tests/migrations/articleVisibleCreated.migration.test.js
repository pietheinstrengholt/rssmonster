import { afterEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260922003000-add-article-visible-created-index.mjs';

const qi = db.sequelize.getQueryInterface();
const table = 'visible_created_migration_articles';
const name = 'articles_user_visible_created_idx';
const fixtureName = `test_${name}`;
// SQLite index names are shared across tables; keep fixture and application indexes separate.
const adapter = {
  showIndex: async () => (await qi.showIndex(table)).map(index => ({
    ...index, name: index.name === fixtureName ? name : index.name
  })),
  addIndex: (_table, fields, options) => qi.addIndex(table, fields, { ...options, name: fixtureName }),
  removeIndex: () => qi.removeIndex(table, fixtureName)
};

describe('Article visible creation-time index migration', () => {
  afterEach(async () => { await qi.dropTable(table); });

  it('supports retries and rollback without changing rows or other indexes', async () => {
    const { INTEGER, BOOLEAN, DATE } = db.Sequelize;
    await qi.createTable(table, {
      id: { type: INTEGER, primaryKey: true }, userId: INTEGER, filteredInd: BOOLEAN,
      duplicateOfArticleId: INTEGER, createdAt: DATE
    });
    await qi.addIndex(table, ['userId'], { name: 'visible_created_existing_idx' });
    await qi.bulkInsert(table, [{ id: 1, userId: 2, filteredInd: false,
      duplicateOfArticleId: null, createdAt: new Date('2026-09-22T00:00:00Z') }]);
    const rows = await qi.select(null, table, {});
    const existing = await qi.showIndex(table);
    const applicationIndexes = await qi.showIndex('articles');

    await up(adapter);
    await up(adapter);
    const indexes = await qi.showIndex(table);
    expect(indexes).toHaveLength(existing.length + 1);
    const added = indexes.find(index => index.name === fixtureName);
    expect(added.unique).toBe(false);
    expect(added.fields.map(field => field.attribute)).toEqual([
      'userId', 'filteredInd', 'duplicateOfArticleId', 'createdAt'
    ]);
    expect(await qi.select(null, table, {})).toEqual(rows);

    await down(adapter);
    await down(adapter);
    expect(await qi.showIndex(table)).toEqual(existing);
    expect(await qi.select(null, table, {})).toEqual(rows);
    await up(adapter);
    expect(await qi.showIndex(table)).toHaveLength(existing.length + 1);
    expect(await qi.showIndex('articles')).toEqual(applicationIndexes);
  });
});
