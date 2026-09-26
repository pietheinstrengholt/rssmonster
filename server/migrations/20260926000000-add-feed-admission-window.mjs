export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('feeds', 'initialImportCompletedAt', {
    type: Sequelize.DATE, allowNull: true, defaultValue: null
  });
  await queryInterface.addColumn('feeds', 'ongoingAdmissionWindowDays', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 30
  });
  // Grandfather established feeds at migration time; their exact first-import date is unknown.
  // Fetch success or a partial article receipt alone does not prove a completed import.
  const feeds = queryInterface.queryGenerator.quoteTable('feeds');
  await queryInterface.sequelize.query(`
    UPDATE ${feeds} SET initialImportCompletedAt = CURRENT_TIMESTAMP
    WHERE lastSuccessfulCrawlAt IS NOT NULL OR totalCrawlSuccesses > 0
  `);
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('feeds', 'ongoingAdmissionWindowDays');
  await queryInterface.removeColumn('feeds', 'initialImportCompletedAt');
};
