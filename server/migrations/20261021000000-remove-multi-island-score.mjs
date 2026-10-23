// Retire experimental coverage without rewriting any retained Article scores or state.
export const up = async queryInterface => {
  const columns = await queryInterface.describeTable('articles');
  if (!columns.multiIslandScore) return;
  if (queryInterface.sequelize.getDialect() === 'sqlite') {
    // Native DROP COLUMN preserves referencing rows, indexes and triggers. Sequelize 6's
    // SQLite removeColumn rebuilds the table and can cascade-delete dependent records.
    await queryInterface.sequelize.query('ALTER TABLE articles DROP COLUMN multiIslandScore');
  } else {
    await queryInterface.removeColumn('articles', 'multiIslandScore');
  }
};

export const down = async () => {
  throw new Error('Removed coverage values cannot be reconstructed. Restore a verified database backup.');
};
