import mysql from './lib/baseline24-mysql.json' with { type: 'json' };
import sqlite from './lib/baseline24-sqlite.json' with { type: 'json' };
import { bootstrapBaseline24 } from './lib/baseline24Bootstrap.mjs';
import { MIGRATION_STATE_TABLE } from './lib/baseline24Definition.mjs';

const mariaDbTable = sql => {
  let create = sql.replaceAll('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci');
  if (create.startsWith('CREATE TABLE `crawl_runs`')) {
    create = create.replace(
      "  UNIQUE KEY `crawl_runs_active_user_unique` (((case when (`status` = _utf8mb4'running') then `userId` else NULL end))),",
      "  `activeCrawlUserId` int GENERATED ALWAYS AS (CASE WHEN `status` = 'running' THEN `userId` ELSE NULL END) VIRTUAL,\n  UNIQUE KEY `crawl_runs_active_user_unique` (`activeCrawlUserId`),"
    );
  }
  return create;
};

export const up = async queryInterface => {
  const { sequelize } = queryInterface;
  const dialect = sequelize.getDialect();
  if (!['mysql', 'sqlite'].includes(dialect)) throw new Error('Baseline 2.4 supports MySQL and SQLite.');
  const tables = await queryInterface.showAllTables();
  if (tables.some(name => !['sequelizemeta', MIGRATION_STATE_TABLE.toLowerCase(), 'sqlite_sequence'].includes(name.toLowerCase()))) {
    throw new Error('Baseline 2.4 requires an empty database. Existing schemas must use their migration history.');
  }
  const definition = dialect === 'sqlite' ? sqlite : mysql;
  const apply = async options => {
    for (const table of definition.tables) {
      const create = process.env.DB_DIALECT === 'mariadb' ? mariaDbTable(table.create) : table.create;
      await sequelize.query(create, options);
      for (const index of table.indexes) await sequelize.query(index, options);
    }
    for (const table of definition.tables) {
      for (const constraint of table.foreignKeys) await sequelize.query(constraint, options);
    }
    await bootstrapBaseline24(queryInterface, options);
  };
  // MySQL DDL commits implicitly; SQLite can atomically create schema and bootstrap.
  if (dialect === 'sqlite') await sequelize.transaction(transaction => apply({ transaction }));
  else await apply({});
};

export const down = async () => {
  throw new Error('Baseline 2.4 cannot be rolled back automatically. Restore a database backup.');
};
