export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('sidebar_settings', {
    id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    showTotalCount: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    declutterCounts: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
  await queryInterface.addIndex('sidebar_settings', ['userId'], {
    name: 'sidebar_settings_userId_unique',
    unique: true
  });
};

export const down = queryInterface => queryInterface.dropTable('sidebar_settings');
