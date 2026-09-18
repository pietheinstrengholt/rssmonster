export const up = (queryInterface, Sequelize) => queryInterface.createTable('server_settings', {
  key: { type: Sequelize.STRING(100), primaryKey: true, allowNull: false },
  value: { type: Sequelize.JSON, allowNull: false },
  createdAt: { type: Sequelize.DATE, allowNull: false },
  updatedAt: { type: Sequelize.DATE, allowNull: false }
});

export const down = queryInterface => queryInterface.dropTable('server_settings');
