export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('sidebar_settings', 'sortOrder', {
    type: Sequelize.STRING(32), allowNull: false, defaultValue: 'manual'
  });
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('sidebar_settings', 'sortOrder');
};
