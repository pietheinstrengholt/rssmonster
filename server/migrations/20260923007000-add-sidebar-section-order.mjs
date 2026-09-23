export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('sidebar_settings', 'sectionOrder', {
    type: Sequelize.JSON, allowNull: true, defaultValue: null
  });
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('sidebar_settings', 'sectionOrder');
};
