export const up = async (queryInterface, Sequelize) => {
  for (const table of ['feeds', 'categories']) {
    await queryInterface.addColumn(table, 'pinned', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
    });
  }
};

export const down = async queryInterface => {
  for (const table of ['categories', 'feeds']) {
    await queryInterface.removeColumn(table, 'pinned');
  }
};
