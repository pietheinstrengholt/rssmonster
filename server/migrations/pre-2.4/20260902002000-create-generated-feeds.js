'use strict';

module.exports = {
  // Creates persisted, user-owned Generated Feed configurations for MySQL and SQLite.
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('generated_feeds', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      expression: { type: Sequelize.TEXT, allowNull: false },
      token: { type: Sequelize.STRING(64), allowNull: false },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      tokenRegeneratedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addIndex('generated_feeds', ['userId'], {
      name: 'generated_feeds_userId_idx'
    });
    await queryInterface.addIndex('generated_feeds', ['token'], {
      name: 'generated_feeds_token_unique',
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('generated_feeds');
  }
};
