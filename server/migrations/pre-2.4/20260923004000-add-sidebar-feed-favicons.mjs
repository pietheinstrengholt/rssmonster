export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('sidebar_settings', 'showFeedFavicons', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true
  });
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('sidebar_settings', 'showFeedFavicons');
};
