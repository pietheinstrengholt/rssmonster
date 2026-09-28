import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from 'sequelize';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260810004000-baseline-crawling.js');

describe('crawl active-run uniqueness baseline', () => {
  let sequelize;
  let queryInterface;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    queryInterface = sequelize.getQueryInterface();
    await queryInterface.createTable('users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
    await queryInterface.createTable('feeds', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
    });
  });

  afterEach(async () => {
    await sequelize?.close();
  });

  it('blocks a second active crawl but allows completed history for the same user', async () => {
    await migration.up(queryInterface);
    await queryInterface.bulkInsert('users', [{ id: 1 }]);
    const timestamp = new Date();
    const crawlRun = status => ({
      userId: 1,
      status,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await queryInterface.bulkInsert('crawl_runs', [crawlRun('running')]);
    await queryInterface.bulkInsert('crawl_runs', [crawlRun('completed')]);
    await queryInterface.bulkInsert('crawl_runs', [crawlRun('completed')]);

    await expect(
      queryInterface.bulkInsert('crawl_runs', [crawlRun('running')])
    ).rejects.toThrow();
  });
});
