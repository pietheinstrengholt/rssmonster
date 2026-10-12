export const up = async (queryInterface, Sequelize) => {
  // SQLite VARCHAR already has unbounded text affinity; avoid rebuilding its foreign keys.
  if (queryInterface.sequelize.getDialect() === 'sqlite') return;
  await queryInterface.changeColumn('feeds', 'authenticationPassword', {
    type: Sequelize.TEXT, allowNull: true, defaultValue: null
  });
};

export const down = async (queryInterface, Sequelize) => {
  if (queryInterface.sequelize.getDialect() === 'sqlite') return;
  await queryInterface.changeColumn('feeds', 'authenticationPassword', {
    type: Sequelize.STRING, allowNull: true, defaultValue: null
  });
};
