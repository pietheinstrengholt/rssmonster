import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configureRuntime } from '../runtime.js';
import { configureDesktopDatabase } from '../database.js';

test('desktop transactions reserve the SQLite writer before reading', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-sqlite-lock-'));
  await configureRuntime(directory);
  const { default: db } = await import('../../server/models/index.js');
  configureDesktopDatabase(db);
  const other = new db.Sequelize({ dialect: 'sqlite', storage: process.env.DB_STORAGE, logging: false, retry: { max: 0 } });
  try {
    await db.sequelize.query('CREATE TABLE desktop_lock_test (value INTEGER)');
    await db.sequelize.query('INSERT INTO desktop_lock_test VALUES (0)');
    await other.query('PRAGMA busy_timeout = 0');
    await db.sequelize.transaction(async transaction => {
      await db.sequelize.query('SELECT value FROM desktop_lock_test', { transaction });
      // A second process cannot write between this transaction’s read and update.
      await assert.rejects(other.query('UPDATE desktop_lock_test SET value = value + 1'), /SQLITE_BUSY/);
      await db.sequelize.query('UPDATE desktop_lock_test SET value = value + 1', { transaction });
    });
    await other.query('UPDATE desktop_lock_test SET value = value + 1');
    const [rows] = await db.sequelize.query('SELECT value FROM desktop_lock_test');
    assert.equal(rows[0].value, 2);
  } finally {
    await other.close();
    await db.sequelize.close();
    await rm(directory, { recursive: true, force: true });
  }
});
