export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('briefing_preferences', 'includeHotArticles', {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: true
  });
};

export const down = queryInterface =>
  queryInterface.removeColumn('briefing_preferences', 'includeHotArticles');
