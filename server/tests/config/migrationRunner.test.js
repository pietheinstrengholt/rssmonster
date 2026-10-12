import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { createDatabaseMigrator } from '../../config/migrateDatabase.js';
const execute = promisify(execFile);
const runner = fileURLToPath(new URL('../../scripts/migrateDatabase.js', import.meta.url));
describe('ESM migration command', () => {
  it('shows help without loading or modifying a database', async () => {
    const result = await execute(process.execPath, [runner, '--help'], { env: { ...process.env, DB_DIALECT: 'invalid-test-dialect' } });
    expect(result.stdout).toContain('Usage: npm run db');
  });
  it('rejects unsupported arguments without running migrations', async () => {
    await expect(execute(process.execPath, [runner, '--unknown'], { env: { ...process.env, DB_DIALECT: 'invalid-test-dialect' } }))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Unsupported migration arguments') });
  });
});

const inventory = JSON.parse(await readFile(new URL('../fixtures/pre24MigrationInventory.json', import.meta.url), 'utf8'));
const historicalDirectory = new URL('../../migrations/pre-2.4/', import.meta.url);

it('preserves the approved historical inventory and contents except relocated imports', async () => {
  const names = (await readdir(historicalDirectory)).filter(name => /^\d.*\.(?:mjs|js)$/.test(name)).sort();
  expect(names).toEqual(inventory.migrations.map(migration => migration.name));
  for (const { name, sha256 } of inventory.migrations) {
    const source = (await readFile(new URL(name, historicalDirectory), 'utf8')).replace(/\r\n/g, '\n');
    // Only dependency paths change when the historical file moves down one directory.
    const original = source.replace(/(['"])\.\.\/\.\.\/(utils|seeders)\//g, '$1../$2/')
      .replace("from '../lib/articleStateMigration.mjs'", "from '../utils/articleStateContract.js'");
    expect(createHash('sha256').update(original).digest('hex'), name).toBe(sha256);
    const imported = await import(new URL(name, historicalDirectory));
    expect(typeof (imported.default || imported).up, name).toBe('function');
    expect(typeof (imported.default || imported).down, name).toBe('function');
  }
  for (const { name, sha256 } of inventory.dependencies) {
    // The helper's introductory comment describes its new location; its historical code is frozen.
    const source = (await readFile(new URL(name, historicalDirectory), 'utf8')).replace(/\r\n/g, '\n');
    const historicalCode = source.split('\n').slice(1).join('\n').trimEnd() + '\n';
    expect(createHash('sha256').update(historicalCode).digest('hex'), name).toBe(sha256);
  }
});

const dialects = db.sequelize.getDialect() === 'mysql' ? ['mysql', 'sqlite'] : ['sqlite'];

describe.each(dialects)('migration history after relocation (%s)', dialect => {
  const withDatabase = async run => {
    const sequelize = dialect === 'sqlite'
      ? new Sequelize({ dialect, storage: ':memory:', logging: false })
      : db.sequelize;
    try { await run({ sequelize, Sequelize }); } finally {
      if (sequelize !== db.sequelize) await sequelize.close();
    }
  };

  it('recognizes every historical filename without replaying or rewriting history', async () => {
    await withDatabase(async database => {
      const migrator = createDatabaseMigrator(database);
      const query = database.sequelize.getQueryInterface();
      const names = inventory.migrations.map(migration => migration.name);
      const olderName = '20180101000000-retained-legacy-history.js';
      const retained = [...names, olderName];
      try {
        expect((await migrator.pending()).map(migration => migration.file)).toEqual(names);
        await query.bulkInsert('SequelizeMeta', retained.map(name => ({ name })));
        expect(await migrator.pending()).toEqual([]);
        await migrator.up();
        await migrator.up();
        expect((await migrator.executed()).map(migration => migration.file)).toEqual([...retained].sort());
        // Recorded migrations must not attempt to create any application tables.
        if (dialect === 'sqlite') expect(await query.showAllTables()).toEqual(['SequelizeMeta']);
      } finally {
        await query.bulkDelete('SequelizeMeta', { name: retained });
      }
    });
  });

  it('executes pending root and nested migrations in original filename order after a move', async () => {
    await withDatabase(async database => {
      const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-migration-relocation-'));
      const query = database.sequelize.getQueryInterface();
      const table = 'migration_relocation_order_test';
      const names = ['20240101000000-first.mjs', '20240102000000-second.mjs', '20240103000000-third.mjs'];
      try {
        await writeFile(path.join(directory, names[0]), `export async function up(qi, Sequelize) {
          await qi.createTable('${table}', { position: { type: Sequelize.INTEGER, primaryKey: true } });
          await qi.bulkInsert('${table}', [{ position: 1 }]);
        }
        export async function down() {}`);
        for (const [index, name] of names.entries()) {
          if (!index) continue;
          await writeFile(path.join(directory, name), `export async function up(qi) {
            const rows = await qi.select(null, '${table}', { order: [['position', 'ASC']] });
            if (rows.length !== ${index}) throw new Error('Migration executed out of order or replayed');
            await qi.bulkInsert('${table}', [{ position: ${index + 1} }]);
          }
          export async function down() {}`);
        }
        await createDatabaseMigrator(database, directory).up({ to: names[0] });
        const nested = path.join(directory, 'pre-2.4', 'nested');
        await mkdir(nested, { recursive: true });
        await rename(path.join(directory, names[0]), path.join(nested, names[0]));
        await rename(path.join(directory, names[2]), path.join(nested, names[2]));
        await writeFile(path.join(nested, 'README.md'), 'Not a migration.');
        const relocated = createDatabaseMigrator(database, directory);
        expect((await relocated.pending()).map(migration => migration.file)).toEqual(names.slice(1));
        await relocated.up();
        await relocated.up();
        expect((await query.select(null, table, { order: [['position', 'ASC']] })).map(row => row.position)).toEqual([1, 2, 3]);
        expect((await relocated.executed()).map(migration => migration.file)).toEqual(names);
      } finally {
        await query.dropTable(table);
        await query.bulkDelete('SequelizeMeta', { name: names });
        await rm(directory, { recursive: true, force: true });
      }
    });
  });
});
