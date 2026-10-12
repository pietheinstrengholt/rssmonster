export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('feeds', 'authenticationType', {
    type: Sequelize.ENUM('basic'),
    allowNull: true,
    defaultValue: null
  });
  for (const column of ['authenticationUsername', 'authenticationPassword']) {
    await queryInterface.addColumn('feeds', column, {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null
    });
  }
};

export const down = async queryInterface => {
  for (const column of ['authenticationPassword', 'authenticationUsername', 'authenticationType']) {
    await queryInterface.removeColumn('feeds', column);
  }
};
