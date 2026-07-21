import '../setup/database.js';
import db from '../../models/index.js';

const TEST_DATABASE_NAME = 'rssmonstertest';

const executeConnectionQuery = (connection, sql, values = []) =>
  new Promise((resolve, reject) => {
    connection.query(sql, values, (error, results) =>
      error ? reject(error) : resolve(results)
    );
  });

export async function resetDatabase() {
  const { sequelize } = db;
  const databaseName = sequelize.getDatabaseName();

  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to reset database "${databaseName}". Tests must use "${TEST_DATABASE_NAME}".`
    );
  }

  const queryInterface = sequelize.getQueryInterface();
  const connection = await sequelize.connectionManager.getConnection();

  try {
    await executeConnectionQuery(
      connection,
      'SET FOREIGN_KEY_CHECKS = 0;'
    );

    try {
      const tables = await executeConnectionQuery(
        connection,
        `
          SELECT TABLE_NAME AS tableName
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = ?
            AND TABLE_TYPE = 'BASE TABLE';
        `,
        [databaseName]
      );

      const quotedTableNames = tables.map(({ tableName }) =>
        queryInterface.quoteIdentifier(tableName)
      );

      // Hard reset: drop all tables & recreate from models
      if (quotedTableNames.length) {
        await executeConnectionQuery(
          connection,
          `DROP TABLE IF EXISTS ${quotedTableNames.join(', ')};`
        );
      }
    } finally {
      await executeConnectionQuery(
        connection,
        'SET FOREIGN_KEY_CHECKS = 1;'
      );
    }
  } finally {
    await sequelize.connectionManager.releaseConnection(connection);
  }

  await sequelize.sync();
}