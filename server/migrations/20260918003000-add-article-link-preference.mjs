export const up = (queryInterface, Sequelize) => queryInterface.addColumn('user_settings', 'openArticleLinksInNewTab', {
  type: Sequelize.BOOLEAN,
  allowNull: false,
  defaultValue: false
});

export const down = queryInterface => queryInterface.removeColumn('user_settings', 'openArticleLinksInNewTab');
