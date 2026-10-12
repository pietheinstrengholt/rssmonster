// URLs can identify different resources when their path/query case differs.
// Match Feed.url's existing STRING.BINARY contract without rewriting values or
// regenerating the frozen baseline. SQLite already uses binary text comparison.
export const up = async (queryInterface, Sequelize) => {
  const dialect = queryInterface.sequelize.getDialect();
  if (dialect === 'sqlite') return;
  if (dialect !== 'mysql') throw new Error('Feed URL collation migration supports MySQL and SQLite.');
  await queryInterface.changeColumn('feeds', 'url', { type: Sequelize.STRING.BINARY, allowNull: false });
};

export const down = async () => {
  throw new Error('Restoring case-insensitive URL uniqueness may conflict with newer feeds. Restore a verified database backup.');
};
