export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('webhooks', {
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
    enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    endpointUrl: { type: Sequelize.TEXT, allowNull: false },
    secret: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
    matchMode: {
      type: Sequelize.ENUM('ALL', 'ANY'),
      allowNull: false,
      defaultValue: 'ALL'
    },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  });
  await queryInterface.addIndex('webhooks', ['userId'], {
    name: 'webhooks_userId_idx'
  });

  await queryInterface.createTable('webhook_conditions', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    webhookId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'webhooks', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    field: { type: Sequelize.STRING(64), allowNull: false },
    operator: { type: Sequelize.STRING(32), allowNull: false },
    value: { type: Sequelize.TEXT, allowNull: false },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  });
  await queryInterface.addIndex('webhook_conditions', ['webhookId'], {
    name: 'webhook_conditions_webhookId_idx'
  });

  await queryInterface.createTable('webhook_deliveries', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    webhookId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'webhooks', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    articleId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'articles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    status: {
      type: Sequelize.ENUM('pending', 'success', 'failed'),
      allowNull: false,
      defaultValue: 'pending'
    },
    attemptCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    lastAttemptAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
    nextAttemptAt: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.NOW },
    httpStatus: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
    error: { type: Sequelize.STRING(2000), allowNull: true, defaultValue: null },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  });
  await queryInterface.addIndex('webhook_deliveries', ['webhookId', 'articleId'], {
    name: 'webhook_deliveries_webhook_article_unique',
    unique: true
  });
  await queryInterface.addIndex('webhook_deliveries', ['articleId'], {
    name: 'webhook_deliveries_articleId_idx'
  });
  await queryInterface.addIndex('webhook_deliveries', ['status', 'nextAttemptAt', 'id'], {
    name: 'webhook_deliveries_status_nextAttemptAt_idx'
  });
};

export const down = async queryInterface => {
  await queryInterface.dropTable('webhook_deliveries');
  await queryInterface.dropTable('webhook_conditions');
  await queryInterface.dropTable('webhooks');
};
