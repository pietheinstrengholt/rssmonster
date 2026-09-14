import { afterEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260914001000-add-article-interaction-timestamps.mjs';
import { BEHAVIOR_TIMESTAMP_FIELDS } from '../../services/articles/articleBehaviorTime.js';

const qi = db.sequelize.getQueryInterface();
const table = 'interaction_migration_articles';
const references = 'interaction_migration_references';
const adapter = {
  describeTable: () => qi.describeTable(table),
  addColumn: (_table, field, options) => qi.addColumn(table, field, options)
};
async function createOldSchema() {
  await qi.createTable(table, {
    id: { type: db.Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: db.Sequelize.STRING, allowNull: false },
    favoriteInd: { type: db.Sequelize.INTEGER, defaultValue: 0 },
    clickedAmount: { type: db.Sequelize.INTEGER, defaultValue: 0 },
    positiveInd: { type: db.Sequelize.INTEGER, defaultValue: 0 },
    negativeInd: { type: db.Sequelize.INTEGER, defaultValue: 0 },
    attentionBucket: { type: db.Sequelize.INTEGER, defaultValue: 0 },
    publishedAt: { type: db.Sequelize.DATE, allowNull: true }
  });
  await qi.addIndex(table, ['title'], { name: 'interaction_title_index' });
  await qi.createTable(references, {
    articleId: { type: db.Sequelize.INTEGER, references: { model: table, key: 'id' } }
  });
}
const rows = () => qi.select(null, table, { order: [['id', 'ASC']] });

describe(`Article interaction timestamp migration (${db.sequelize.getDialect()})`, () => {
  afterEach(async () => { await qi.dropTable(references); await qi.dropTable(table); });

  it('supports fresh creation and persists each nullable interaction clock', async () => {
    await createOldSchema();
    await up(adapter, db.Sequelize);
    const columns = await qi.describeTable(table);
    for (const field of BEHAVIOR_TIMESTAMP_FIELDS) expect(columns[field].allowNull).toBe(true);
    const timestamp = new Date('2026-09-14T12:00:00Z');
    await qi.bulkInsert(table, [{ title: 'Fresh', ...Object.fromEntries(BEHAVIOR_TIMESTAMP_FIELDS.map(field => [field, timestamp])) }]);
    const [row] = await rows();
    for (const field of BEHAVIOR_TIMESTAMP_FIELDS) expect(new Date(row[field]).getTime()).toBe(timestamp.getTime());
  });

  it('preserves legacy state, indexes, foreign references and unknown times, including a retry', async () => {
    await createOldSchema();
    await qi.bulkInsert(table, [{ id: 17, title: 'Legacy', favoriteInd: 1, clickedAmount: 3,
      positiveInd: 1, negativeInd: 0, attentionBucket: 4, publishedAt: new Date('2022-01-01T00:00:00Z') }]);
    await qi.bulkInsert(references, [{ articleId: 17 }]);
    const [before] = await rows();
    await up(adapter, db.Sequelize);
    await up(adapter, db.Sequelize);
    const [after] = await rows();
    expect(after).toEqual({ ...before, ...Object.fromEntries(BEHAVIOR_TIMESTAMP_FIELDS.map(field => [field, null])) });
    expect(await qi.select(null, references, {})).toEqual([{ articleId: 17 }]);
    expect((await qi.showIndex(table)).some(index => index.name === 'interaction_title_index')).toBe(true);
    await qi.bulkInsert(table, [{ title: 'Next' }]);
    expect((await rows())[1].id).toBeGreaterThan(17);
    await expect(down()).rejects.toThrow('behavioral evidence');
  });
});
