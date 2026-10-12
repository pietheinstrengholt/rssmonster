export const clearMigrationDatabase = async sequelize => {
  if (sequelize.getDialect() === 'mysql') {
    // The same isolated database contract used by the existing reset helper.
    if (sequelize.getDatabaseName() !== 'rssmonstertest') throw new Error('Baseline tests require rssmonstertest.');
    const connection = await sequelize.connectionManager.getConnection();
    try {
      const execute = sql => new Promise((resolve, reject) => connection.query(sql, (error, rows) => error ? reject(error) : resolve(rows)));
      await execute('SET FOREIGN_KEY_CHECKS = 0');
      try {
        const tables = await execute('SHOW TABLES');
        if (tables.length) await execute(`DROP TABLE ${tables.map(row => sequelize.getQueryInterface().quoteIdentifier(Object.values(row)[0])).join(', ')}`);
      } finally { await execute('SET FOREIGN_KEY_CHECKS = 1'); }
    } finally { await sequelize.connectionManager.releaseConnection(connection); }
  } else {
    await sequelize.query('PRAGMA foreign_keys = OFF');
    try {
      for (const name of await sequelize.getQueryInterface().showAllTables()) {
        if (name !== 'sqlite_sequence') await sequelize.getQueryInterface().dropTable(name);
      }
    } finally { await sequelize.query('PRAGMA foreign_keys = ON'); }
  }
};
