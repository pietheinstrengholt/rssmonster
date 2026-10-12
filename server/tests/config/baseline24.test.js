import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { clearMigrationDatabase } from '../helpers/clearMigrationDatabase.js';
import { resetDatabase } from '../helpers/resetDb.js';
import { createDatabaseMigrator, migrateDatabase } from '../../config/migrateDatabase.js';
import { BASELINE_24, captureBaseline24, reconcileSqliteTable } from '../../migrations/lib/baseline24Definition.mjs';
import { up as baselineUp, down as baselineDown } from '../../migrations/20261012010000-baseline-2.4.mjs';
import { normalizeMigrationSchema } from '../../config/migrationSchema.js';

const inventory = JSON.parse(await readFile(new URL('../fixtures/pre24MigrationInventory.json', import.meta.url), 'utf8'));
const dialects = db.sequelize.getDialect() === 'mysql' ? ['mysql', 'sqlite'] : ['sqlite'];
const execute = promisify(execFile);



describe.each(dialects)('baseline 2.4 (%s)', dialect => {
  it('matches the complete historical schema after documented SQLite repairs and preserves both histories', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-baseline24-test-'));
    const migrations = path.join(directory, 'migrations');
    await mkdir(migrations);
    await writeFile(path.join(migrations, BASELINE_24), `export { up, down } from ${JSON.stringify(new URL('../../migrations/20261012010000-baseline-2.4.mjs', import.meta.url).href)};`);
    const storage = dialect === 'sqlite' ? path.join(directory, 'database.sqlite') : null;
    const sequelize = dialect === 'mysql' ? db.sequelize : new Sequelize({ dialect, storage, logging: false });
    const database = { sequelize, Sequelize };
    const query = sequelize.getQueryInterface();
    try {
      await clearMigrationDatabase(sequelize);
      const historical = createDatabaseMigrator(database);
      await historical.up();
      const reference = await captureBaseline24(sequelize);
      const expected = dialect === 'sqlite' ? { ...reference, tables: reference.tables.map(reconcileSqliteTable) } : reference;
      expect(reference.tables).toHaveLength(35);
      const [initialData] = await sequelize.query('SELECT identity, displayName, categoryName, description, status FROM island_taxonomy');
      expect(initialData).toHaveLength(1);

      // A pending historical rename completes before validated baseline adoption;
      // original history and rows remain intact.
      const last = inventory.migrations.at(-1).name;
      const migration = await import(new URL(`../../migrations/pre-2.4/${last}`, import.meta.url));
      await migration.down(query);
      await query.bulkDelete('SequelizeMeta', { name: last });
      await migrateDatabase(database, migrations);
      await migrateDatabase(database, migrations);
      expect((await historical.executed()).map(row => row.file)).toEqual([...inventory.migrations.map(row => row.name), BASELINE_24]);
      expect(normalizeMigrationSchema(await captureBaseline24(sequelize))).toEqual(normalizeMigrationSchema(expected));
      expect((await sequelize.query('SELECT identity, displayName, categoryName, description, status FROM island_taxonomy'))[0]).toEqual(initialData);

      await clearMigrationDatabase(sequelize);
      await migrateDatabase(database, migrations);
      const baseline = await captureBaseline24(sequelize);
      expect(baseline).toEqual(expected);
      expect((await sequelize.query('SELECT name FROM SequelizeMeta'))[0]).toEqual([{ name: BASELINE_24 }]);
      expect((await sequelize.query('SELECT identity, displayName, categoryName, description, status FROM island_taxonomy'))[0]).toEqual(initialData);

      // Every initialized model can select all its persisted attributes, without
      // sync/alter masking missing migration columns or tables.
      for (const model of Object.values(db).filter(value => value?.rawAttributes)) {
        const columns = Object.values(model.rawAttributes).filter(attribute => attribute.type.key !== 'VIRTUAL').map(attribute => query.quoteIdentifier(attribute.field));
        await sequelize.query(`SELECT ${columns.join(', ')} FROM ${query.quoteIdentifier(model.tableName)} LIMIT 1`);
        if (sequelize === db.sequelize) await model.findAll({ limit: 1 });
        const persisted = dialect === 'sqlite'
          ? Object.fromEntries((await sequelize.query(`PRAGMA table_info(${query.quoteIdentifier(model.tableName)})`))[0].map(column => [column.name, { allowNull: !column.notnull && !column.pk }]))
          : await query.describeTable(model.tableName);
        for (const attribute of Object.values(model.rawAttributes).filter(attribute => attribute.type.key !== 'VIRTUAL')) {
          expect(persisted[attribute.field].allowNull, `${model.tableName}.${attribute.field} nullability`).toBe(attribute.primaryKey ? false : attribute.allowNull ?? true);
        }
      }
      const now = new Date();
      await query.bulkInsert('users', [{ username: 'baseline-owner', feverCredentialHash: 'baseline-hash', lastLogin: now, createdAt: now, updatedAt: now }]);
      await expect(query.bulkInsert('users', [{ username: 'baseline-owner', lastLogin: now, createdAt: now, updatedAt: now }])).rejects.toThrow();
      await expect(query.bulkInsert('users', [{ username: 'other-owner', feverCredentialHash: 'baseline-hash', lastLogin: now, createdAt: now, updatedAt: now }])).rejects.toThrow();
      const [users] = await sequelize.query("SELECT id FROM users WHERE username = 'baseline-owner'");
      await query.bulkInsert('smart_folders', [{ userId: users[0].id, name: 'Retained folder', query: '', createdAt: now, updatedAt: now }]);
      await migrateDatabase(database, migrations);
      expect((await sequelize.query('SELECT name FROM smart_folders'))[0]).toEqual([{ name: 'Retained folder' }]);
      expect(await captureBaseline24(sequelize)).toEqual(baseline);
      await query.bulkDelete('users', { id: users[0].id });
      expect((await sequelize.query('SELECT * FROM smart_folders'))[0]).toEqual([]);
      await expect(baselineUp(query)).rejects.toThrow('requires an empty database');
      await expect(baselineDown()).rejects.toThrow('cannot be rolled back automatically');
      if (dialect === 'sqlite') expect((await sequelize.query('PRAGMA foreign_key_check'))[0]).toEqual([]);
      // A real initialized model registry and Express startup must work against
      // the baseline, without the global test setup's model sync hiding drift.
      await migrateDatabase(database); // Then validate current models/startup with all root increments.
      await execute(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import db from './models/index.js';
        import { startServer, stopServer } from './app.js';
        import { migrateDatabase } from './config/migrateDatabase.js';
        let server;
        try {
          await migrateDatabase(db);
          for (const model of Object.values(db).filter(value => value?.rawAttributes)) await model.findAll({ limit: 1 });
          server = await startServer({ port: 0, host: '127.0.0.1' });
          const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/health');
          assert.equal(response.status, 200);
        } finally { await stopServer(server); await db.sequelize.close(); }
      `], { cwd: new URL('../../', import.meta.url), env: { ...process.env, DB_DIALECT: dialect, ...(storage ? { DB_STORAGE: storage } : {}), DISABLE_LISTENER: 'false', ENABLE_HTTPS: 'false' }, timeout: 30000 });
      await query.bulkDelete('SequelizeMeta', {});
      await expect(migrateDatabase(database)).rejects.toThrow('state, SequelizeMeta and actual schema disagree');
      expect((await sequelize.query('SELECT identity FROM island_taxonomy'))[0]).toHaveLength(1);
    } finally {
      if (sequelize === db.sequelize) await resetDatabase();
      else await sequelize.close();
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }, 120000);
});
