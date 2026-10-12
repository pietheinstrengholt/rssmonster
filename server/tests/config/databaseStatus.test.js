import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { databaseStatus, formatDatabaseStatus } from '../../config/databaseStatus.js';
import { createDatabaseMigrator, migrateDatabase } from '../../config/migrateDatabase.js';
import { readMigrationHistory } from '../../config/migrationState.js';
import { inspectMigrationSchema } from '../../config/migrationSchema.js';
import { withMigrationLock } from '../../config/migrationLock.js';
import { BASELINE_24 } from '../../migrations/lib/baseline24Definition.mjs';
import { clearMigrationDatabase } from '../helpers/clearMigrationDatabase.js';
import { resetDatabase } from '../helpers/resetDb.js';
import { installDatabaseConnectionPolicy } from '../../config/databaseRuntime.js';

const execute = promisify(execFile);
const cli = new URL('../../scripts/databaseStatus.js', import.meta.url).pathname;
const template = new URL('../../migrations/templates/new-migration.mjs', import.meta.url);
const baseline = new URL('../../migrations/20261012010000-baseline-2.4.mjs', import.meta.url).href;
const dialects = db.sequelize.getDialect() === 'mysql' ? ['mysql', 'sqlite'] : ['sqlite'];

const withDatabase = async (dialect, run) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-status-test-'));
  const sequelize = dialect === 'mysql' ? db.sequelize : new Sequelize({ dialect, storage: path.join(directory, 'db.sqlite'), logging: false });
  const migrations = path.join(directory, 'migrations');
  await mkdir(migrations);
  await writeFile(path.join(migrations, BASELINE_24), `export { up, down } from ${JSON.stringify(baseline)};`);
  try {
    await clearMigrationDatabase(sequelize);
    await run({ sequelize, migrations, directory, database: { sequelize, Sequelize } });
  } finally {
    if (sequelize === db.sequelize) await resetDatabase();
    else await sequelize.close();
    await rm(directory, { recursive: true, force: true });
  }
};

describe.each(dialects)('database diagnostics (%s)', dialect => {
  it('recognizes an empty database without creating tracking tables', async () => withDatabase(dialect, async ({ sequelize, migrations }) => {
    expect(await databaseStatus(sequelize, migrations)).toMatchObject({ baseline: 'Uninitialized', applied: 0, pending: 1, legacy: 'Not required', state: 'Initialization required', inconsistencies: [] });
    expect(await sequelize.getQueryInterface().showAllTables()).toEqual([]);
  }));

  it('reports pending increments and repeated current status without changing schema or history', async () => withDatabase(dialect, async ({ sequelize, database, migrations, directory }) => {
    await migrateDatabase(database, migrations);
    {
      const beforeCli = await readMigrationHistory(sequelize);
      const beforeFile = dialect === 'sqlite' ? await readFile(path.join(directory, 'db.sqlite')) : null;
      const result = await execute(process.execPath, [cli, '--json'], { env: { ...process.env, DB_DIALECT: dialect, ...(dialect === 'sqlite' ? { DB_STORAGE: path.join(directory, 'db.sqlite') } : {}) } });
      expect(JSON.parse(result.stdout)).toMatchObject({ state: 'Pending migrations', applied: 1, pending: 2, validation: 'Passed' });
      expect(await readMigrationHistory(sequelize)).toEqual(beforeCli);
      if (beforeFile) expect(await readFile(path.join(directory, 'db.sqlite'))).toEqual(beforeFile);
    }
    await writeFile(path.join(migrations, '20261013000000-status-test.mjs'), 'export async function up() {}');
    const before = { history: await readMigrationHistory(sequelize), schema: await inspectMigrationSchema(sequelize) };
    expect(await databaseStatus(sequelize, migrations)).toMatchObject({ baseline: '2.4.0', applied: 1, pending: 1, validation: 'Passed', legacy: 'Complete' });
    expect({ history: await readMigrationHistory(sequelize), schema: await inspectMigrationSchema(sequelize) }).toEqual(before);
    await migrateDatabase(database, migrations);
    const status = await databaseStatus(sequelize, migrations);
    expect(status).toMatchObject({ applied: 2, pending: 0, state: 'Up to date' });
    expect(await databaseStatus(sequelize, migrations)).toEqual(status);
    expect(formatDatabaseStatus(status)).toContain('Schema validation: Passed');
  }));

  it('reports the remaining legacy chain without adopting or executing it', async () => withDatabase(dialect, async ({ sequelize, database, migrations }) => {
    const raw = createDatabaseMigrator(database);
    await raw.up({ to: '20260810000000-baseline-core.js' });
    const before = await readMigrationHistory(sequelize);
    expect(await databaseStatus(sequelize, migrations)).toMatchObject({ baseline: 'Pre-2.4 (recognized checkpoint)', applied: 1, pending: 72, legacy: '71 historical migrations required; baseline adoption required', validation: 'Passed' });
    expect(await readMigrationHistory(sequelize)).toEqual(before);
  }));

  it('retains counts and explains incomplete migration failures without replay', async () => withDatabase(dialect, async ({ sequelize, database, migrations }) => {
    await writeFile(path.join(migrations, '20261013000000-failure-test.mjs'), "export async function up() { throw new Error('test failure'); }");
    await expect(migrateDatabase(database, migrations)).rejects.toThrow('test failure');
    expect(await databaseStatus(sequelize, migrations)).toMatchObject({ state: 'Blocked', applied: 1, pending: null, validation: 'Failed', inconsistencies: [expect.stringContaining('Incomplete migration')] });
    expect((await readMigrationHistory(sequelize, { allowIncomplete: true })).state.inProgress).toBe('20261013000000-failure-test.mjs');
  }));

  it('detects incompatible schema and leaves it intact', async () => withDatabase(dialect, async ({ sequelize, database, migrations }) => {
    await migrateDatabase(database, migrations);
    await sequelize.getQueryInterface().createTable('unexpected_table', { id: { type: Sequelize.INTEGER, primaryKey: true } });
    expect(await databaseStatus(sequelize, migrations)).toMatchObject({ state: 'Blocked', validation: 'Failed', inconsistencies: [expect.stringContaining('disagree')] });
    expect(await sequelize.getQueryInterface().showAllTables()).toContain('unexpected_table');
  }));

  it('does not claim validation while another migrator holds the lock', async () => withDatabase(dialect, async ({ sequelize, migrations }) => {
    await withMigrationLock(sequelize, async () => {
      expect(await databaseStatus(sequelize, migrations)).toMatchObject({ state: 'Blocked', applied: null, validation: 'Not performed', inconsistencies: [expect.stringContaining('lock')] });
    });
  }));
});

it('reports foreign key data failures even when the schema fingerprint is compatible', async () => withDatabase('sqlite', async ({ sequelize, database, migrations }) => {
  await migrateDatabase(database, migrations);
  await sequelize.query('PRAGMA foreign_keys = OFF');
  try {
    const now = new Date();
    await sequelize.getQueryInterface().bulkInsert('feeds', [{ userId: 999, categoryId: 999, feedTags: '[]', feedName: 'Orphan', url: 'https://example.test/orphan', createdAt: now, updatedAt: now }]);
  } finally { await sequelize.query('PRAGMA foreign_keys = ON'); }
  expect(await databaseStatus(sequelize, migrations)).toMatchObject({ state: 'Blocked', validation: 'Failed', inconsistencies: [expect.stringContaining('foreign-key violations')] });
  expect((await sequelize.query('SELECT userId FROM feeds'))[0]).toEqual([{ userId: 999 }]);
}));

it('reads a live WAL database without changing its database, journal or tracking records', async () => withDatabase('sqlite', async ({ sequelize, database, directory }) => {
  installDatabaseConnectionPolicy(sequelize);
  await sequelize.query('PRAGMA wal_autocheckpoint = 0');
  await migrateDatabase(database);
  const storage = path.join(directory, 'db.sqlite');
  const before = { main: await readFile(storage), wal: await readFile(storage + '-wal'), history: await readMigrationHistory(sequelize) };
  const result = await execute(process.execPath, [cli, '--json'], { env: { ...process.env, DB_DIALECT: 'sqlite', DB_STORAGE: storage } });
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'Up to date', validation: 'Passed', pending: 0 });
  expect(await readFile(storage)).toEqual(before.main);
  expect(await readFile(storage + '-wal')).toEqual(before.wal);
  expect(await readMigrationHistory(sequelize)).toEqual(before.history);
  expect((await sequelize.query('PRAGMA journal_mode'))[0][0].journal_mode).toBe('wal');
}));

it('shows help and rejects arguments before loading database configuration', async () => {
  const env = { ...process.env, DB_DIALECT: 'invalid' };
  expect((await execute(process.execPath, [cli, '--help'], { env })).stdout).toContain('Usage: npm run db:status');
  await expect(execute(process.execPath, [cli, '--unknown'], { env })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Unsupported status arguments') });
});

it('never creates a missing SQLite database and emits a machine-readable diagnostic', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-status-cli-'));
  const storage = path.join(directory, 'missing.sqlite');
  try {
    await expect(execute(process.execPath, [cli, '--json'], { env: { ...process.env, DB_DIALECT: 'sqlite', DB_STORAGE: storage } })).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('No file was created'), stderr: '' });
    await expect(readFile(storage)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('refuses to execute an unfinished developer template', async () => {
  const migration = await import(template);
  await expect(migration.up()).rejects.toThrow('Implement');
  await expect(migration.down()).rejects.toThrow('rollback');
});
