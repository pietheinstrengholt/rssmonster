// Sequelize 6 bulkUpdate without attribute types binds JavaScript Dates as epoch
// milliseconds on SQLite. These historical writes preserved the instant, but
// DATE reads expect strings. Normalize only the known affected fields; retain
// valid text/null values and reject unsupported numeric representations.
export const up = async queryInterface => {
  const { sequelize } = queryInterface;
  const dialect = sequelize.getDialect();
  if (dialect === 'mysql') return;
  if (dialect !== 'sqlite') throw new Error('Historical date normalization supports MySQL and SQLite.');
  await sequelize.transaction(async transaction => {
    for (const [table, column] of [['island_taxonomy', 'updatedAt'], ['email_deliveries', 'availableAt'], ['email_deliveries', 'completedAt']]) {
      const name = queryInterface.quoteIdentifier(column);
      const target = queryInterface.quoteIdentifier(table);
      const converted = `strftime('%Y-%m-%d %H:%M:%f +00:00', ${name} / 1000.0, 'unixepoch')`;
      const [invalid] = await sequelize.query(`SELECT 1 FROM ${target} WHERE typeof(${name}) IN ('integer', 'real') AND (typeof(${name}) <> 'integer' OR ${converted} IS NULL) LIMIT 1`, { transaction });
      if (invalid.length) throw new Error(`Cannot normalize ${table}.${column}: unsupported numeric timestamp. Expected historical integer epoch milliseconds; no rows were changed.`);
      await sequelize.query(`UPDATE ${target} SET ${name} = ${converted} WHERE typeof(${name}) = 'integer'`, { transaction });
    }
  });
};

export const down = async () => {
  throw new Error('Historical date representation cannot be reconstructed automatically. Restore a verified database backup.');
};
