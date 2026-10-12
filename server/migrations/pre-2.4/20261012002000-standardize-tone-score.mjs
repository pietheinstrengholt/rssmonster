const fields = { articles: ['sentimentScore', 'toneScore'], user_settings: ['minSentimentScore', 'minToneScore'] };

async function renameToneColumns(queryInterface, reverse = false) {
  for (const [table, pair] of Object.entries(fields)) {
    const [previous, next] = reverse ? [...pair].reverse() : pair;
    const columns = await queryInterface.describeTable(table);
    if (columns[previous] && columns[next]) throw new Error(`Both ${table}.${previous} and ${next} exist; resolve the schema before retrying.`);
    if (!columns[previous]) continue;
    if (queryInterface.sequelize.getDialect() === 'sqlite') {
      // Native rename preserves schema objects and foreign-key references.
      const quote = name => queryInterface.quoteIdentifier(name);
      await queryInterface.sequelize.query(`ALTER TABLE ${quote(table)} RENAME COLUMN ${quote(previous)} TO ${quote(next)}`);
    } else await queryInterface.renameColumn(table, previous, next);
  }
}

export const up = queryInterface => renameToneColumns(queryInterface);
export const down = queryInterface => renameToneColumns(queryInterface, true);
