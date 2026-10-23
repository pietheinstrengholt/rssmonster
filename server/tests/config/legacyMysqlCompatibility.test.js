import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { createDatabaseMigrator, migrateDatabase } from '../../config/migrateDatabase.js';
import { databaseStatus } from '../../config/databaseStatus.js';
import { inspectMigrationSchema, schemaHash } from '../../config/migrationSchema.js';
import { BASELINE_24, MIGRATION_STATE_TABLE } from '../../migrations/lib/baseline24Definition.mjs';
import baseline from '../../migrations/lib/baseline24-mysql.json' with { type: 'json' };
import legacy from '../../migrations/lib/legacy24-mysql.json' with { type: 'json' };
import catalog from '../../migrations/lib/history24-mysql.json' with { type: 'json' };
import { clearMigrationDatabase } from '../helpers/clearMigrationDatabase.js';
import { resetDatabase } from '../helpers/resetDb.js';

// Reconstruct the captured legacy layout at each of the final naming checkpoints.
// Creation is confined to the isolated test database; runtime only recognizes it.
const definitionAt = index => {
  const definition = structuredClone(baseline);
  const aliases = {
    articles: { savedInd: 'favoriteInd', savedAt: 'favoritedAt', openedOriginalCount: 'clickedAmount', lastOpenedOriginalAt: 'lastClickedAt' },
    feeds: { feedOpenedOriginalAvg: 'feedClickAvg', feedOpenedOriginalRatio: 'feedClickRatio' },
    archiving_settings: { neverDeleteSaved: 'neverDeleteFavorites', neverDeleteOpenedOriginalArticles: 'neverDeleteClickedArticles' }
  };
  definition.tables = definition.tables.map(table => structuredClone(legacy.tableOverrides.find(override => override.name === table.name) || table));
  for (const table of definition.tables) {
    if (index === 0) {
      for (const [canonical, previous] of Object.entries(aliases[table.name] || {})) table.create = table.create.replaceAll('`' + canonical + '`', '`' + previous + '`');
    }
    if (index < 3) {
      if (table.name === 'articles') table.create = table.create.replaceAll('`toneScore`', '`sentimentScore`');
      if (table.name === 'user_settings') table.create = table.create.replaceAll('`minToneScore`', '`minSentimentScore`');
    }
    if (index < 2 && table.name === 'user_settings') table.create = table.create.replace("DEFAULT 'expanded'", "DEFAULT 'full'");
  }
  return definition;
};

it('retains exact captured production and development fingerprints at every naming checkpoint', () => {
  expect(legacy.schemas).toHaveLength(4);
  for (const [index, checkpoint] of legacy.schemas.entries()) expect(schemaHash(definitionAt(index))).toBe(checkpoint.schemaHash);
  expect(legacy.schemas[0].schemaHash).toBe('466af292b64fc6bdaebaf5c839307acdb0607a6c7122f1be810e0c5ffcff59de');
  expect(legacy.schemas.at(-1).schemaHash).toBe('8f6456f16005c299871d2ea1d2a2aba0cb1c9f696fda2fa02038b459e127bd1a');
});

const createLegacy = async index => {
  for (const table of definitionAt(index).tables) await db.sequelize.query(table.create);
  for (const table of definitionAt(index).tables) for (const foreignKey of table.foreignKeys) await db.sequelize.query(foreignKey);
  await createDatabaseMigrator(db).storage.executed();
  const names = catalog.migrations.filter(migration => migration.name <= legacy.schemas[index].lastMigration).map(migration => migration.name);
  await db.sequelize.getQueryInterface().bulkInsert('SequelizeMeta', names.map(name => ({ name })));
  return names;
};

const isolated = async run => {
  await clearMigrationDatabase(db.sequelize);
  try { await run(db.sequelize.getQueryInterface()); } finally { await resetDatabase(); }
};

const snapshots = legacy.schemas.map((checkpoint, index) => [checkpoint.lastMigration, index]);
describe.skipIf(db.sequelize.getDialect() !== 'mysql')('verified legacy MySQL layouts', () => {
  it.each(snapshots)('upgrades %s and preserves data, schema layout and history on repeated startup', async (_name, index) => {
    await isolated(async query => {
      const recorded = await createLegacy(index);
      const now = new Date('2026-01-15T12:00:00Z');
      await query.bulkInsert('users', [{ id: 41, username: 'retained-owner', password: 'retained-hash', feverCredentialHash: 'retained-fever', lastLogin: now, createdAt: now, updatedAt: now }]);
      await query.bulkInsert('categories', [{ id: 42, userId: 41, name: 'Retained category', createdAt: now, updatedAt: now }]);
      await query.bulkInsert('feeds', [{ id: 43, userId: 41, categoryId: 42, feedName: 'Retained feed', url: 'https://example.test/Retained.xml', feedTags: null, createdAt: now, updatedAt: now }]);
      await query.bulkInsert('articles', [{ id: 44, userId: 41, feedId: 43, title: 'Retained article', contentOriginal: '<p>Retained content</p>', [index ? 'savedInd' : 'favoriteInd']: 1, [index ? 'openedOriginalCount' : 'clickedAmount']: 3, [index === 3 ? 'toneScore' : 'sentimentScore']: 88, publishedAt: now, createdAt: now, updatedAt: now }]);
      await query.bulkInsert('user_settings', [{ userId: 41, status: index ? 'saved' : 'favorite', viewMode: index >= 2 ? 'expanded' : 'full', createdAt: now, updatedAt: now }]);
      const before = await databaseStatus(db.sequelize);
      expect(before.validation).toBe('Passed');
      expect(before.pending).toBe(9 - index);
      expect(before.baseline).toBe(index === 3 ? '2.4.0 (adoption required)' : 'Pre-2.4 (recognized checkpoint)');
      await migrateDatabase(db);
      const after = await inspectMigrationSchema(db.sequelize);
      // Naming migrations converge to this verified layout, rather than recreating
      // frozen tables or changing nullable tags, index names or the publisher check.
      // The nullable affinity score is the only change to the verified legacy layout.
      const previousDefinition = structuredClone(after.definition);
      const articles = previousDefinition.tables.find(table => table.name === 'articles');
      const affinityColumn = '  `semanticAffinityScore` float DEFAULT NULL,\n';
      expect(articles.create).toContain(affinityColumn);
      articles.create = articles.create.replace(affinityColumn, '');
      expect(schemaHash(previousDefinition)).toBe(legacy.schemas.at(-1).schemaHash);
      const [names] = await db.sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name');
      expect(names.map(row => row.name)).toHaveLength(78);
      expect(names.map(row => row.name)).toEqual(expect.arrayContaining([...recorded, BASELINE_24]));
      const [tracking] = await db.sequelize.query(`SELECT * FROM \`${MIGRATION_STATE_TABLE}\``);
      expect(tracking[0]).toMatchObject({ schemaHash: after.hash, baselineVersion: '2.4.0', inProgress: null });
      expect((await db.sequelize.query('SELECT id, password, feverCredentialHash FROM users WHERE id = 41'))[0]).toEqual([{ id: 41, password: 'retained-hash', feverCredentialHash: 'retained-fever' }]);
      expect((await db.sequelize.query('SELECT contentOriginal, savedInd, openedOriginalCount, toneScore FROM articles WHERE id = 44'))[0]).toEqual([{ contentOriginal: '<p>Retained content</p>', savedInd: 1, openedOriginalCount: 3, toneScore: 88 }]);
      expect((await db.sequelize.getQueryInterface().describeTable('articles')).multiIslandScore).toBeUndefined();
      expect((await db.sequelize.query('SELECT feedTags, url FROM feeds WHERE id = 43'))[0]).toEqual([{ feedTags: null, url: 'https://example.test/Retained.xml' }]);
      expect((await db.sequelize.query('SELECT status, viewMode FROM user_settings WHERE userId = 41'))[0]).toEqual([{ status: 'saved', viewMode: 'expanded' }]);
      await migrateDatabase(db);
      expect(await inspectMigrationSchema(db.sequelize)).toEqual(after);
      expect((await db.sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name'))[0]).toEqual(names);
      expect(await databaseStatus(db.sequelize)).toMatchObject({ state: 'Up to date', baseline: '2.4.0', applied: 78, pending: 0, validation: 'Passed', inconsistencies: [] });
    });
  }, 120000);

  it.each(['wrong checkpoint', 'extra column', 'missing foreign key'])('rejects %s without creating migration state or rewriting history', async problem => {
    await isolated(async query => {
      await createLegacy(3);
      if (problem === 'wrong checkpoint') await query.bulkDelete('SequelizeMeta', { name: legacy.schemas.at(-1).lastMigration });
      if (problem === 'extra column') await db.sequelize.query('ALTER TABLE feeds ADD unknownLegacyField INT');
      if (problem === 'missing foreign key') await db.sequelize.query('ALTER TABLE feeds DROP FOREIGN KEY feeds_ibfk_1');
      const before = await inspectMigrationSchema(db.sequelize);
      const [names] = await db.sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name');
      await expect(migrateDatabase(db)).rejects.toThrow('Unrecognized');
      expect(await inspectMigrationSchema(db.sequelize)).toEqual(before);
      expect((await db.sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name'))[0]).toEqual(names);
      expect(await query.showAllTables()).not.toContain(MIGRATION_STATE_TABLE);
    });
  }, 240000);
});
