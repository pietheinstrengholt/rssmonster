import { execFile, fork } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { migrateDatabase, createDatabaseMigrator } from '../../config/migrateDatabase.js';
import { BASELINE_24, MIGRATION_STATE_TABLE } from '../../migrations/lib/baseline24Definition.mjs';
import { clearMigrationDatabase } from '../helpers/clearMigrationDatabase.js';
import { resetDatabase } from '../helpers/resetDb.js';
import { databaseStatus } from '../../config/databaseStatus.js';
import { inspectMigrationSchema } from '../../config/migrationSchema.js';
import { withMigrationLock } from '../../config/migrationLock.js';

const execute = promisify(execFile);
const childRunner = fileURLToPath(new URL('../helpers/runMigrationOrchestration.js', import.meta.url));
const baselineModule = new URL('../../migrations/20261012010000-baseline-2.4.mjs', import.meta.url).href;
const dialects = db.sequelize.getDialect() === 'mysql' ? ['mysql', 'sqlite'] : ['sqlite'];
const next = '20261013000000-incremental-test.mjs';
const later = '20261014000000-incremental-test.mjs';

const withDatabase = async (dialect, run) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-orchestration-test-'));
  const storage = path.join(directory, 'database.sqlite');
  const sequelize = dialect === 'mysql' ? db.sequelize : new Sequelize({ dialect, storage, logging: false });
  const database = { sequelize, Sequelize };
  const migrations = path.join(directory, 'migrations');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(migrations);
  await writeFile(path.join(migrations, BASELINE_24), `export { up, down } from ${JSON.stringify(baselineModule)};`);
  try {
    await clearMigrationDatabase(sequelize);
    await run({ database, query: sequelize.getQueryInterface(), migrations, directory, env: { ...process.env, DB_DIALECT: dialect, ...(dialect === 'sqlite' ? { DB_STORAGE: storage } : {}) } });
  } finally {
    if (sequelize === db.sequelize) await resetDatabase();
    else await sequelize.close();
    await rm(directory, { recursive: true, force: true });
  }
};

const history = async sequelize => (await sequelize.query('SELECT name FROM SequelizeMeta ORDER BY name'))[0].map(row => row.name);
const state = async sequelize => (await sequelize.query(`SELECT * FROM \`${MIGRATION_STATE_TABLE}\``))[0][0];

const seedRetainedData = async query => {
  const now = new Date('2026-01-15T12:00:00Z');
  await query.bulkInsert('users', [{ id: 41, username: 'retained-owner', password: 'retained-hash', feverCredentialHash: 'retained-fever', lastLogin: now, createdAt: now, updatedAt: now }]);
  await query.bulkInsert('categories', [{ id: 42, userId: 41, name: 'Retained category', createdAt: now, updatedAt: now }]);
  await query.bulkInsert('feeds', [{ id: 43, userId: 41, categoryId: 42, feedName: 'Retained feed', url: 'https://example.test/retained.xml', feedTags: '["retained"]', createdAt: now, updatedAt: now }]);
  const canonical = Boolean((await query.describeTable('articles')).toneScore);
  await query.bulkInsert('articles', [{ id: 44, userId: 41, feedId: 43, title: 'Retained article', contentOriginal: '<p>Retained content</p>', [canonical ? 'savedInd' : 'favoriteInd']: 1, [canonical ? 'openedOriginalCount' : 'clickedAmount']: 3, [canonical ? 'toneScore' : 'sentimentScore']: 88, publishedAt: now, createdAt: now, updatedAt: now }]);
  const tables = await query.showAllTables();
  await query.bulkInsert(tables.includes('user_settings') ? 'user_settings' : 'settings', [{ userId: 41, status: canonical ? 'saved' : 'favorite', viewMode: canonical ? 'expanded' : 'full', createdAt: now, updatedAt: now }]);
};

const expectRetainedData = async sequelize => {
  expect((await sequelize.query('SELECT id, username, password, feverCredentialHash FROM users WHERE id = 41'))[0]).toEqual([{ id: 41, username: 'retained-owner', password: 'retained-hash', feverCredentialHash: 'retained-fever' }]);
  expect((await sequelize.query('SELECT id, userId, categoryId, feedName FROM feeds WHERE id = 43'))[0]).toEqual([{ id: 43, userId: 41, categoryId: 42, feedName: 'Retained feed' }]);
  expect((await sequelize.query('SELECT id, userId, feedId, title, contentOriginal, savedInd, openedOriginalCount, toneScore FROM articles WHERE id = 44'))[0]).toEqual([{ id: 44, userId: 41, feedId: 43, title: 'Retained article', contentOriginal: '<p>Retained content</p>', savedInd: 1, openedOriginalCount: 3, toneScore: 88 }]);
  expect((await sequelize.query('SELECT status, viewMode FROM user_settings WHERE userId = 41'))[0]).toEqual([{ status: 'saved', viewMode: 'expanded' }]);
};

describe.each(dialects)('version-aware migrations (%s)', dialect => {
  it('upgrades a frozen baseline to model-compatible URL comparison without changing retained data or keys', async () => {
    await withDatabase(dialect, async ({ database, query, migrations }) => {
      await migrateDatabase(database, migrations);
      await seedRetainedData(query);
      const before = (await inspectMigrationSchema(database.sequelize)).definition.tables.find(table => table.name === 'feeds');
      await migrateDatabase(database);
      await migrateDatabase(database);
      await expectRetainedData(database.sequelize);
      const after = (await inspectMigrationSchema(database.sequelize)).definition.tables.find(table => table.name === 'feeds');
      expect(after.foreignKeys).toEqual(before.foreignKeys);
      expect(after.indexes).toEqual(before.indexes);
      expect(after.create).toBe(dialect === 'mysql' ? before.create.replace('`url` varchar(255) COLLATE utf8mb4_unicode_ci', '`url` varchar(255) COLLATE utf8mb4_bin') : before.create);
      const now = new Date();
      for (const url of ['https://example.test/Feed.xml', 'https://example.test/feed.xml']) {
        await query.bulkInsert('feeds', [{ userId: 41, categoryId: 42, feedName: url, url, feedTags: '[]', createdAt: now, updatedAt: now }]);
        expect((await database.sequelize.query('SELECT url FROM feeds WHERE userId = 41 AND url = :url', { replacements: { url } }))[0]).toEqual([{ url }]);
      }
      await expect(query.bulkInsert('feeds', [{ userId: 41, categoryId: 42, feedName: 'Duplicate', url: 'https://example.test/Feed.xml', feedTags: '[]', createdAt: now, updatedAt: now }])).rejects.toThrow();
      expect(await history(database.sequelize)).toEqual([BASELINE_24, '20261013010000-align-feed-url-collation.mjs', '20261013011000-normalize-sqlite-migration-dates.mjs']);
    });
  });

  it('preserves SQL-looking string defaults in fingerprints and detects changes to them', async () => {
    await withDatabase(dialect, async ({ database, query, migrations }) => {
      const literal = 'keep AUTO_INCREMENT=123 FOREIGN KEY CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
      await writeFile(path.join(migrations, next), `export async function up(qi, Sequelize) {
        await qi.createTable('schema_literals', { id: { type: Sequelize.INTEGER, primaryKey: true }, value: { type: Sequelize.STRING, defaultValue: ${JSON.stringify(literal)} } });
      }`);
      await migrateDatabase(database, migrations);
      const before = await inspectMigrationSchema(database.sequelize);
      const table = before.definition.tables.find(table => table.name === 'schema_literals');
      expect(table.create).toContain(literal);
      expect(table.foreignKeys).toEqual([]);
      await query.changeColumn('schema_literals', 'value', { type: Sequelize.STRING, defaultValue: literal.replace('123', '456') });
      expect((await inspectMigrationSchema(database.sequelize)).hash).not.toBe(before.hash);
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('state, SequelizeMeta and actual schema disagree');
    });
  });

  it('bootstraps once, applies ordered increments and recognizes their changed schema on restart', async () => {
    await withDatabase(dialect, async ({ database, migrations }) => {
      await writeFile(path.join(migrations, next), `export async function up(qi, Sequelize) {
        await qi.createTable('incremental_notes', { position: { type: Sequelize.INTEGER, primaryKey: true } });
        await qi.bulkInsert('incremental_notes', [{ position: 1 }]);
      }`);
      await writeFile(path.join(migrations, later), "export async function up(qi) { await qi.bulkInsert('incremental_notes', [{position: 2}]); }");
      await migrateDatabase(database, migrations);
      await migrateDatabase(database, migrations);
      expect(await history(database.sequelize)).toEqual([BASELINE_24, next, later]);
      expect((await database.sequelize.query('SELECT position FROM incremental_notes ORDER BY position'))[0]).toEqual([{ position: 1 }, { position: 2 }]);
      expect(await state(database.sequelize)).toMatchObject({ baselineVersion: '2.4.0', lastMigration: later, inProgress: null });
    });
  });

  it('adopts the completed historical endpoint without recreating populated schema or replacing history', async () => {
    await withDatabase(dialect, async ({ database, query, migrations }) => {
      await createDatabaseMigrator(database).up();
      await query.bulkInsert('SequelizeMeta', [{ name: '20180101000000-retained-history.js' }]);
      await seedRetainedData(query);
      const previous = await history(database.sequelize);
      expect(await databaseStatus(database.sequelize, migrations)).toMatchObject({
        baseline: dialect === 'mysql' ? '2.4.0 (adoption required)' : 'Pre-2.4 (recognized checkpoint)', pending: 1,
        legacy: 'Baseline adoption required', validation: 'Passed', inconsistencies: []
      });
      expect(await history(database.sequelize)).toEqual(previous);
      await migrateDatabase(database, migrations);
      await migrateDatabase(database, migrations);
      expect(await history(database.sequelize)).toEqual([...previous, BASELINE_24]);
      await expectRetainedData(database.sequelize);
      expect(await state(database.sequelize)).toMatchObject({ baselineVersion: '2.4.0', lastMigration: BASELINE_24, inProgress: null });
      const missing = previous.find(name => name.startsWith('20260811000000'));
      await query.bulkDelete('SequelizeMeta', { name: missing });
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('not a contiguous ordered prefix');
      expect(await history(database.sequelize)).not.toContain(missing);
      await expectRetainedData(database.sequelize);
    });
  }, 120000);

  it.each(['20260810004000-baseline-crawling.js', '20260910001000-allow-oidc-only-users.js'])('upgrades historical checkpoint %s before adoption and newer increments, preserving user state', async cutoff => {
    await withDatabase(dialect, async ({ database, query, migrations }) => {
      await createDatabaseMigrator(database).up({ to: cutoff });
      await seedRetainedData(query);
      const now = new Date();
      await query.bulkInsert('feeds', [{ id: 100, userId: 41, categoryId: 42, feedName: 'Deleted feed', url: 'https://example.test/deleted.xml', feedTags: '[]', createdAt: now, updatedAt: now }]);
      await query.bulkDelete('feeds', { id: 100 });
      await writeFile(path.join(migrations, next), `export async function up(qi) {
        const [rows] = await qi.sequelize.query('SELECT savedInd, openedOriginalCount, toneScore FROM articles WHERE id = 44');
        if (rows[0].savedInd !== 1 || rows[0].openedOriginalCount !== 3 || rows[0].toneScore !== 88) throw new Error('Increment ran before historical canonicalization');
      }`);
      await migrateDatabase(database, migrations);
      expect(await history(database.sequelize)).toHaveLength(74);
      expect(await state(database.sequelize)).toMatchObject({ lastMigration: next, inProgress: null });
      await expectRetainedData(database.sequelize);
      await query.bulkInsert('feeds', [{ userId: 41, categoryId: 42, feedName: 'Next feed', url: 'https://example.test/next.xml', feedTags: '[]', createdAt: now, updatedAt: now }]);
      expect((await database.sequelize.query("SELECT id FROM feeds WHERE feedName = 'Next feed'"))[0][0].id).toBeGreaterThan(100);
    });
  }, 120000);

  it('rejects a committed legacy operation whose history was never recorded, preserving rows and original tracking', async () => {
    await withDatabase(dialect, async ({ database, query, migrations }) => {
      const unrecorded = '20260810001000-baseline-feeds.js';
      await createDatabaseMigrator(database).up({ to: unrecorded });
      const now = new Date();
      await query.bulkInsert('users', [{ id: 41, username: 'legacy-owner', password: 'retained-password', feverCredentialHash: 'retained-fever', lastLogin: now, createdAt: now, updatedAt: now }]);
      // Simulate an old runner crashing after committed DDL but before logging it.
      await query.bulkDelete('SequelizeMeta', { name: unrecorded });
      const before = await inspectMigrationSchema(database.sequelize);
      const recorded = await history(database.sequelize);
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('Unrecognized');
      expect(await inspectMigrationSchema(database.sequelize)).toEqual(before);
      expect(await history(database.sequelize)).toEqual(recorded);
      expect(await query.showAllTables()).not.toContain(MIGRATION_STATE_TABLE);
      expect((await database.sequelize.query('SELECT username, password FROM users WHERE id = 41'))[0]).toEqual([{ username: 'legacy-owner', password: 'retained-password' }]);
    });
  });

  it('rejects untracked partial schema, forged baseline history, schema drift and missing history without executing increments', async () => {
    await withDatabase(dialect, async ({ database, query, migrations }) => {
      await query.createTable('users', { id: { type: Sequelize.INTEGER, primaryKey: true } });
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('no migration history');
      expect(await query.showAllTables()).toEqual(['users']);
      await createDatabaseMigrator(database).pending();
      await query.bulkInsert('SequelizeMeta', [{ name: BASELINE_24 }]);
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('Unrecognized');
      expect(await history(database.sequelize)).toEqual([BASELINE_24]);
      await clearMigrationDatabase(database.sequelize);
      await migrateDatabase(database, migrations);
      await query.addColumn('users', 'unexpectedColumn', { type: Sequelize.INTEGER });
      await writeFile(path.join(migrations, next), "export async function up() { throw new Error('MUST NOT EXECUTE'); }");
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('state, SequelizeMeta and actual schema disagree');
      expect(await history(database.sequelize)).toEqual([BASELINE_24]);
      await query.removeColumn('users', 'unexpectedColumn');
      await query.bulkInsert('SequelizeMeta', [{ name: '20990101000000-unknown.mjs' }]);
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('Unknown migration history');
    });
  });

  it('never records a failed incremental migration or speculatively replays partial changes', async () => {
    await withDatabase(dialect, async ({ database, migrations }) => {
      await writeFile(path.join(migrations, next), `export async function up(qi, Sequelize) {
        await qi.createTable('partial_change', { id: { type: Sequelize.INTEGER, primaryKey: true } });
        throw new Error('Injected migration failure');
      }`);
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('Injected migration failure');
      expect(await history(database.sequelize)).toEqual([BASELINE_24]);
      expect(await state(database.sequelize)).toMatchObject({ lastMigration: BASELINE_24, inProgress: next });
      await expect(migrateDatabase(database, migrations)).rejects.toThrow(`Incomplete migration ${next}`);
      expect(await database.sequelize.getQueryInterface().showAllTables()).toContain('partial_change');
    });
  });

  it('rejects existing orphan data before running a pending increment or changing history', async () => {
    await withDatabase(dialect, async ({ database, query, migrations }) => {
      await migrateDatabase(database, migrations);
      const now = new Date();
      if (dialect === 'sqlite') {
        await database.sequelize.query('PRAGMA foreign_keys = OFF');
        await query.bulkInsert('smart_folders', [{ userId: 9999, name: 'Orphan', query: '', createdAt: now, updatedAt: now }]);
        await database.sequelize.query('PRAGMA foreign_keys = ON');
      } else {
        const connection = await database.sequelize.connectionManager.getConnection();
        const execute = (sql, values = []) => new Promise((resolve, reject) => connection.query(sql, values, (error, rows) => error ? reject(error) : resolve(rows)));
        try {
          await execute('SET FOREIGN_KEY_CHECKS = 0');
          await execute('INSERT INTO smart_folders (userId, name, `query`, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [9999, 'Orphan', '', now, now]);
        } finally {
          await execute('SET FOREIGN_KEY_CHECKS = 1');
          await database.sequelize.connectionManager.releaseConnection(connection);
        }
      }
      await writeFile(path.join(migrations, next), "export async function up() { throw new Error('MUST NOT EXECUTE'); }");
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('foreign-key violations');
      expect(await history(database.sequelize)).toEqual([BASELINE_24]);
      expect(await state(database.sequelize)).toMatchObject({ inProgress: null, lastMigration: BASELINE_24 });
      expect((await database.sequelize.query('SELECT name FROM smart_folders'))[0]).toEqual([{ name: 'Orphan' }]);
    });
  });

  it('does not record completion when a baseline fails even if schema work already committed', async () => {
    await withDatabase(dialect, async ({ database, migrations }) => {
      await writeFile(path.join(migrations, BASELINE_24), `import {up as baseline} from ${JSON.stringify(baselineModule)};
        export async function up(qi) { await baseline(qi); throw new Error('Injected baseline completion failure'); }`);
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('Injected baseline completion failure');
      expect(await history(database.sequelize)).toEqual([]);
      expect(await state(database.sequelize)).toMatchObject({ lastMigration: null, inProgress: BASELINE_24 });
      await expect(migrateDatabase(database, migrations)).rejects.toThrow('Incomplete migration');
      expect((await database.sequelize.query('SELECT COUNT(*) AS amount FROM island_taxonomy'))[0][0].amount).toBe(1);
    });
  });

  it('blocks simultaneous startup in a second process and succeeds after the first process completes', async () => {
    await withDatabase(dialect, async ({ database, migrations, env }) => {
      await writeFile(path.join(migrations, next), `export async function up(qi, Sequelize) {
        await qi.createTable('concurrent_execution', { id: { type: Sequelize.INTEGER, primaryKey: true } });
        if (process.send) { process.send('migration-entered'); await new Promise(resolve => process.once('message', resolve)); }
        await qi.bulkInsert('concurrent_execution', [{id: 1}]);
      }`);
      const child = fork(childRunner, [migrations], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      let errors = '';
      child.stderr.on('data', output => { errors += output; });
      child.stdout.resume();
      const finished = once(child, 'exit');
      try {
        const entered = once(child, 'message');
        await Promise.race([entered, finished.then(() => { throw new Error(errors || 'First migration process exited before entering its migration'); })]);
        await expect(execute(process.execPath, [childRunner, migrations], { env, timeout: 30000 })).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/migration lock/i) });
        child.send('continue');
        expect((await finished)[0], errors).toBe(0);
        await migrateDatabase(database, migrations);
        expect((await database.sequelize.query('SELECT * FROM concurrent_execution'))[0]).toEqual([{ id: 1 }]);
        expect(await history(database.sequelize)).toEqual([BASELINE_24, next]);
      } finally {
        if (child.exitCode === null) { child.kill(); await finished; }
      }
    });
  }, 60000);

  if (dialect === 'sqlite') {
    it('normalizes historical numeric dates without changing their instants or text/null dates', async () => {
      await withDatabase(dialect, async ({ database, query, migrations, env }) => {
        await migrateDatabase(database, migrations);
        await seedRetainedData(query);
        const instant = new Date('2026-01-15T12:00:00.123Z').valueOf();
        const now = new Date('2026-01-16T12:00:00.456Z');
        await query.bulkInsert('email_deliveries', [{ id: '11111111-1111-4111-8111-111111111111', userId: 41, messageType: 'digest', recipient: 'owner@example.test', payload: '{}', dedupeKey: 'retained-delivery', scheduledAt: now, availableAt: now, createdAt: now, updatedAt: now }]);
        const [before] = await database.sequelize.query('SELECT CAST(scheduledAt AS TEXT) AS scheduledAt, CAST(createdAt AS TEXT) AS createdAt, payload FROM email_deliveries');
        await database.sequelize.query('UPDATE island_taxonomy SET updatedAt = :instant', { replacements: { instant } });
        await database.sequelize.query('UPDATE email_deliveries SET availableAt = :instant, completedAt = :instant', { replacements: { instant } });
        await migrateDatabase(database);
        await migrateDatabase(database);
        const [after] = await database.sequelize.query('SELECT CAST(scheduledAt AS TEXT) AS scheduledAt, CAST(createdAt AS TEXT) AS createdAt, payload FROM email_deliveries');
        expect(after).toEqual(before);
        await execute(process.execPath, ['--input-type=module', '-e', `
          import assert from 'node:assert/strict';
          import db from './models/index.js';
          try {
            const taxonomy = await db.IslandTaxonomy.findOne();
            const delivery = await db.EmailDelivery.findOne();
            for (const value of [taxonomy.updatedAt, delivery.availableAt, delivery.completedAt]) assert.equal(value.valueOf(), ${instant});
          } finally { await db.sequelize.close(); }
        `], { cwd: new URL('../../', import.meta.url), env, timeout: 30000 });
        await expectRetainedData(database.sequelize);
      });
    });

    it('rolls back all date normalization on an unsupported numeric value and blocks automatic replay', async () => {
      await withDatabase(dialect, async ({ database, query, migrations }) => {
        await migrateDatabase(database, migrations);
        await seedRetainedData(query);
        const now = new Date();
        await query.bulkInsert('email_deliveries', [{ id: '22222222-2222-4222-8222-222222222222', userId: 41, messageType: 'digest', recipient: 'owner@example.test', payload: '{}', dedupeKey: 'invalid-delivery', scheduledAt: now, availableAt: now, createdAt: now, updatedAt: now }]);
        await database.sequelize.query('UPDATE island_taxonomy SET updatedAt = 1768478400123');
        await database.sequelize.query('UPDATE email_deliveries SET availableAt = 1.5');
        await expect(migrateDatabase(database)).rejects.toThrow('unsupported numeric timestamp');
        expect((await database.sequelize.query('SELECT typeof(updatedAt) AS representation, CAST(updatedAt AS TEXT) AS value FROM island_taxonomy'))[0]).toEqual([{ representation: 'integer', value: '1768478400123' }]);
        expect((await database.sequelize.query('SELECT CAST(availableAt AS TEXT) AS value FROM email_deliveries'))[0]).toEqual([{ value: '1.5' }]);
        expect(await history(database.sequelize)).toEqual([BASELINE_24, '20261013010000-align-feed-url-collation.mjs']);
        expect(await state(database.sequelize)).toMatchObject({ inProgress: '20261013011000-normalize-sqlite-migration-dates.mjs' });
        await expect(migrateDatabase(database)).rejects.toThrow('Incomplete migration');
      });
    });

    it.each(['different-process', 'same-process'])('leaves a %s replacement lock intact after losing ownership', async owner => {
      await withDatabase(dialect, async ({ database, directory }) => {
        const lock = path.join(directory, 'database.sqlite.migration-lock');
        let replacement;
        await expect(withMigrationLock(database.sequelize, async assertHeld => {
          const original = JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8'));
          replacement = JSON.stringify(owner === 'same-process' ? { ...original, token: 'replacement' } : { pid: -1, host: 'replacement-owner' });
          await writeFile(path.join(lock, 'owner.json'), replacement);
          await assertHeld();
        })).rejects.toThrow('migration lock was lost');
        expect(await readFile(path.join(lock, 'owner.json'), 'utf8')).toBe(replacement);
      });
    });

    it('recognizes metadata casing supported by SQLite without replaying or replacing history', async () => {
      await withDatabase(dialect, async ({ database, query, migrations }) => {
        await migrateDatabase(database, migrations);
        for (const table of ['SequelizeMeta', MIGRATION_STATE_TABLE]) {
          await query.renameTable(table, 'metadata_case_temporary');
          await query.renameTable('metadata_case_temporary', table.toLowerCase());
        }
        await migrateDatabase(database, migrations);
        expect(await history(database.sequelize)).toEqual([BASELINE_24]);
        expect(await state(database.sequelize)).toMatchObject({ inProgress: null, lastMigration: BASELINE_24 });
      });
    });

    it.each(['username', 'feverCredentialHash'])('rejects duplicate legacy %s before changing data or establishing baseline state', async column => {
      await withDatabase(dialect, async ({ database, query, migrations }) => {
        await createDatabaseMigrator(database).up();
        const now = new Date();
        await query.bulkInsert('users', [1, 2].map(id => ({ id, username: `unique-${id}`, [column]: 'duplicate', lastLogin: now, createdAt: now, updatedAt: now })));
        const previous = await history(database.sequelize);
        await expect(migrateDatabase(database, migrations)).rejects.toThrow(`duplicate users.${column}`);
        expect(await history(database.sequelize)).toEqual(previous);
        expect(await query.showAllTables()).not.toContain(MIGRATION_STATE_TABLE);
        expect((await database.sequelize.query('SELECT username FROM users'))[0]).toHaveLength(2);
      });
    }, 120000);

    it('rejects invalid legacy taxonomy status without rewriting it or establishing baseline state', async () => {
      await withDatabase(dialect, async ({ database, query, migrations }) => {
        await createDatabaseMigrator(database).up();
        await query.bulkUpdate('island_taxonomy', { status: 'unknown-status' }, {});
        const previous = await history(database.sequelize);
        await expect(migrateDatabase(database, migrations)).rejects.toThrow('invalid island_taxonomy.status');
        expect(await history(database.sequelize)).toEqual(previous);
        expect(await query.showAllTables()).not.toContain(MIGRATION_STATE_TABLE);
        expect((await database.sequelize.query('SELECT status FROM island_taxonomy'))[0]).toEqual([{ status: 'unknown-status' }]);
      });
    }, 120000);

    it('rejects an abandoned filesystem lock without deleting it or modifying the database', async () => {
      await withDatabase(dialect, async ({ database, migrations, directory }) => {
        const { mkdir } = await import('node:fs/promises');
        const lock = path.join(directory, 'database.sqlite.migration-lock');
        await mkdir(lock);
        await writeFile(path.join(lock, 'owner.json'), '{"pid":1,"host":"other-container"}');
        await expect(migrateDatabase(database, migrations)).rejects.toThrow('never removed automatically');
        expect(await database.sequelize.getQueryInterface().showAllTables()).toEqual([]);
        expect(await readFile(path.join(lock, 'owner.json'), 'utf8')).toContain('other-container');
      });
    });
  }
});
