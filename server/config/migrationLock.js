import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';

const memoryLocks = new WeakSet();
const queryConnection = (connection, sql, values) => new Promise((resolve, reject) => {
  connection.query(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
});

// Lock before inspecting history: a competing process must never classify a
// database while another process is changing its schema or completion records.
export const withMigrationLock = async (sequelize, run) => {
  if (sequelize.getDialect() === 'mysql') {
    const connection = await sequelize.connectionManager.getConnection();
    let acquired = false;
    let destroyed = false;
    let name;
    try {
      const [server] = await queryConnection(connection, 'SELECT @@lower_case_table_names AS casing', []);
      const database = sequelize.getDatabaseName();
      // Case-insensitive servers can select one database through differently
      // cased names. Those aliases must coordinate on the same advisory lock.
      const identity = server.casing ? database.toLowerCase() : database;
      name = 'rssmonster:migrate:' + createHash('sha256').update(identity).digest('hex').slice(0, 40);
      const [row] = await queryConnection(connection, 'SELECT GET_LOCK(?, 0) AS acquired', [name]);
      if (row.acquired !== 1) throw new Error('Another process holds the database migration lock. Retry after it finishes.');
      acquired = true;
      const assertHeld = async () => {
        const [owner] = await queryConnection(connection, 'SELECT IS_USED_LOCK(?) AS owner', [name]);
        if (owner.owner !== connection.threadId) throw new Error('Database migration lock was lost. Migration completion was not recorded.');
      };
      return await run(assertHeld);
    } finally {
      if (acquired) {
        try { await queryConnection(connection, 'SELECT RELEASE_LOCK(?)', [name]); } catch { await sequelize.connectionManager.destroyConnection(connection); destroyed = true; }
      }
      if (!destroyed) await sequelize.connectionManager.releaseConnection(connection);
    }
  }

  const storage = sequelize.options.storage;
  if (!storage || storage === ':memory:') {
    if (memoryLocks.has(sequelize)) throw new Error('Another process holds the database migration lock.');
    memoryLocks.add(sequelize);
    try { return await run(async () => {}); } finally { memoryLocks.delete(sequelize); }
  }
  const absolute = path.resolve(storage);
  const canonical = await realpath(absolute).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return realpath(path.dirname(absolute)).then(parent => path.join(parent, path.basename(absolute)));
  });
  const directory = canonical + '.migration-lock';
  try { await mkdir(directory); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await readFile(path.join(directory, 'owner.json'), 'utf8').catch(() => 'owner unavailable');
    throw new Error(`Database migration lock exists at ${directory} (${owner.trim()}). Retry after the owner finishes. After a crash, confirm no migrator is running before removing this lock; it is never removed automatically.`);
  }
  const ownership = JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString(), token: randomUUID() });
  let published = false;
  try {
    await writeFile(path.join(directory, 'owner.json'), ownership);
    published = true;
    return await run(async () => {
      if (await readFile(path.join(directory, 'owner.json'), 'utf8') !== ownership) throw new Error('Database migration lock was lost.');
    });
  } finally {
    // A replacement owner must retain its lock, even when our ownership check
    // failed. PID/host alone cannot distinguish successive locks in one process.
    if (!published || await readFile(path.join(directory, 'owner.json'), 'utf8').catch(() => null) === ownership) {
      await rm(directory, { recursive: true });
    }
  }
};

// SQLite PRAGMAs are connection-local. Historical rebuilds disable foreign keys
// before opening a transaction; Sequelize normally opens a different file-backed
// connection for that transaction, which would cascade-delete child rows. Startup
// runs before listeners/workers, so its migrations can safely share one connection.
export const withMigrationConnection = async (sequelize, run) => {
  if (sequelize.getDialect() !== 'sqlite') return run();
  const manager = sequelize.connectionManager;
  const getConnection = manager.getConnection;
  const releaseConnection = manager.releaseConnection;
  const connection = await getConnection.call(manager, {});
  const uuid = connection.uuid;
  const [pragmas] = await sequelize.query('PRAGMA foreign_keys');
  const enabled = pragmas.foreign_keys === 1;
  manager.getConnection = async () => connection;
  manager.releaseConnection = () => {};
  try { return await run(); } finally {
    try { await sequelize.query(`PRAGMA foreign_keys = ${enabled ? 'ON' : 'OFF'}`); } finally {
      connection.uuid = uuid;
      manager.getConnection = getConnection;
      manager.releaseConnection = releaseConnection;
    }
  }
};
