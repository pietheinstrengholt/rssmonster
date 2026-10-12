'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('push_subscriptions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      endpoint: { type: Sequelize.TEXT, allowNull: false },
      endpointHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      p256dh: { type: Sequelize.TEXT, allowNull: false },
      auth: { type: Sequelize.TEXT, allowNull: false },
      expirationTime: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('push_subscriptions', ['userId'], {
      name: 'push_subscriptions_userId_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('push_subscriptions');
  }
};
