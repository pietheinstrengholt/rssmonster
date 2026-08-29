import { createRequire } from 'node:module';
import { DataTypes, Sequelize } from 'sequelize';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260829000000-set-neutral-feed-trust-default.js');

let sequelize;

afterEach(async () => {
  await sequelize?.close();
  sequelize = undefined;
});

const readFeedTrustDefault = async () => {
  const [columns] = await sequelize.query('PRAGMA table_info(`feeds`)');
  return columns.find(column => column.name === 'feedTrust')?.dflt_value;
};

describe('neutral feed trust default migration', () => {
  it('uses changeColumn outside SQLite', async () => {
    const queryInterface = {
      changeColumn: vi.fn().mockResolvedValue(undefined),
      sequelize: { getDialect: vi.fn().mockReturnValue('mysql') }
    };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'feeds',
      'feedTrust',
      expect.objectContaining({ allowNull: false, defaultValue: 0.75 })
    );
  });

  it('preserves SQLite data, indexes, and composite foreign keys', async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    await sequelize.query('PRAGMA foreign_keys = ON');
    await sequelize.query(
      'CREATE TABLE `users` (`id` INTEGER PRIMARY KEY AUTOINCREMENT)'
    );
    await sequelize.query(
      'CREATE TABLE `categories` ('
        + '`id` INTEGER PRIMARY KEY AUTOINCREMENT, '
        + '`userId` INTEGER NOT NULL, '
        + 'UNIQUE (`id`, `userId`), '
        + 'FOREIGN KEY (`userId`) REFERENCES `users` (`id`))'
    );
    await sequelize.query(
      'CREATE TABLE `feeds` ('
        + '`id` INTEGER PRIMARY KEY AUTOINCREMENT, '
        + '`userId` INTEGER NOT NULL, '
        + '`categoryId` INTEGER NOT NULL, '
        + "`feedTrust` REAL NOT NULL DEFAULT '0.5', "
        + 'UNIQUE (`id`, `userId`), '
        + 'FOREIGN KEY (`categoryId`, `userId`) '
        + 'REFERENCES `categories` (`id`, `userId`), '
        + 'FOREIGN KEY (`userId`) REFERENCES `users` (`id`), '
        + 'FOREIGN KEY (`categoryId`) REFERENCES `categories` (`id`))'
    );
    await sequelize.query(
      'CREATE INDEX `feeds_user_category_idx` ON `feeds` (`userId`, `categoryId`)'
    );
    await sequelize.query(
      'CREATE TABLE `articles` ('
        + '`id` INTEGER PRIMARY KEY AUTOINCREMENT, '
        + '`feedId` INTEGER NOT NULL REFERENCES `feeds` (`id`))'
    );
    await sequelize.query('INSERT INTO `users` (`id`) VALUES (1)');
    await sequelize.query('INSERT INTO `categories` (`id`, `userId`) VALUES (2, 1)');
    await sequelize.query(
      'INSERT INTO `feeds` (`id`, `userId`, `categoryId`, `feedTrust`) '
        + 'VALUES (3, 1, 2, 0.9)'
    );
    await sequelize.query('INSERT INTO `articles` (`id`, `feedId`) VALUES (4, 3)');

    const queryInterface = sequelize.getQueryInterface();
    await migration.up(queryInterface, DataTypes);

    expect(await readFeedTrustDefault()).toBe('0.75');
    expect((await sequelize.query('SELECT * FROM `feeds`'))[0]).toEqual([
      { id: 3, userId: 1, categoryId: 2, feedTrust: 0.9 }
    ]);
    expect((await sequelize.query('PRAGMA foreign_key_check'))[0]).toEqual([]);
    expect((await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type = 'index' "
        + "AND name = 'feeds_user_category_idx'"
    ))[0]).toEqual([{ name: 'feeds_user_category_idx' }]);
    expect(await sequelize.query('PRAGMA foreign_key_list(`feeds`)')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'categoryId', table: 'categories', to: 'id' }),
        expect.objectContaining({ from: 'userId', table: 'categories', to: 'userId' })
      ])
    );

    await migration.down(queryInterface, DataTypes);

    expect(await readFeedTrustDefault()).toBe('0.5');
    expect((await sequelize.query('PRAGMA foreign_key_check'))[0]).toEqual([]);
  });
});
