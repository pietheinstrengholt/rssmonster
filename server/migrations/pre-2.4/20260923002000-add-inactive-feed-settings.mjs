export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('feeds', 'lastArticleReceivedAt', {
    type: Sequelize.DATE,
    allowNull: true,
    defaultValue: null
  });
  // Recover receipt history from retained articles, not publisher dates or crawl attempts.
  const feeds = queryInterface.queryGenerator.quoteTable('feeds');
  const articles = queryInterface.queryGenerator.quoteTable('articles');
  await queryInterface.sequelize.query(`
    UPDATE ${feeds} SET lastArticleReceivedAt = (
      SELECT MAX(createdAt) FROM ${articles}
      WHERE feedId = ${feeds}.id AND userId = ${feeds}.userId
    )
  `);
  await queryInterface.addColumn('sidebar_settings', 'automaticallyHideInactiveFeeds', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
  await queryInterface.addColumn('sidebar_settings', 'inactiveFeedDays', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 30
  });
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('sidebar_settings', 'inactiveFeedDays');
  await queryInterface.removeColumn('sidebar_settings', 'automaticallyHideInactiveFeeds');
  await queryInterface.removeColumn('feeds', 'lastArticleReceivedAt');
};
