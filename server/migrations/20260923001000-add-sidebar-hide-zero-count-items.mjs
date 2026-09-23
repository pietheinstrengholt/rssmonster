export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('sidebar_settings', 'hideZeroCountItems', {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false
  });
};

export const down = queryInterface =>
  queryInterface.removeColumn('sidebar_settings', 'hideZeroCountItems');
