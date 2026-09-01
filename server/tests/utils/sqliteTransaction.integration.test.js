import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Sequelize from 'sequelize';

import { installDatabaseConnectionPolicy } from '../../config/databaseRuntime.js';
import { retryDatabaseTransaction } from '../../utils/databaseRetry.js';

const openConnections = [];
const temporaryDirectories = [];

// Creates an independent process-like SQLite connection to one shared database file.
const createSqliteConnection = storage => {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage,
    pool: { max: 1, min: 0, idle: 10_000 },
    logging: false
  });
  installDatabaseConnectionPolicy(sequelize);
  openConnections.push(sequelize);
  return sequelize;
};

describe('SQLite replay-safe transactions', () => {
  afterEach(async () => {
    await Promise.all(openConnections.splice(0).map(connection => connection.close()));
    await Promise.all(temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true })
    ));
  });

  it('serializes IMMEDIATE writers across independent connections', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rssmonster-sqlite-'));
    temporaryDirectories.push(directory);
    const storage = path.join(directory, 'contention.sqlite');
    const holderConnection = createSqliteConnection(storage);
    const contenderConnection = createSqliteConnection(storage);
    await holderConnection.query('CREATE TABLE writes (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    await contenderConnection.authenticate();

    let releaseHolder;
    let reportHolderStarted;
    const holderStarted = new Promise(resolve => {
      reportHolderStarted = resolve;
    });
    const holderReleased = new Promise(resolve => {
      releaseHolder = resolve;
    });
    const holder = retryDatabaseTransaction(holderConnection, async transaction => {
      await holderConnection.query(
        "INSERT INTO writes (value) VALUES ('holder')",
        { transaction }
      );
      reportHolderStarted();
      await holderReleased;
    });
    await holderStarted;

    let contenderEntered = false;
    const contender = retryDatabaseTransaction(contenderConnection, async transaction => {
      contenderEntered = true;
      await contenderConnection.query(
        "INSERT INTO writes (value) VALUES ('contender')",
        { transaction }
      );
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    const enteredBeforeRelease = contenderEntered;
    releaseHolder();

    await Promise.all([holder, contender]);
    const [rows] = await holderConnection.query('SELECT value FROM writes ORDER BY id');

    expect(enteredBeforeRelease).toBe(false);
    expect(rows).toEqual([{ value: 'holder' }, { value: 'contender' }]);
  });
});
