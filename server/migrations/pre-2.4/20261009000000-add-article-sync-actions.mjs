export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable('article_sync_actions', {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
    actionId: { type: Sequelize.UUID, allowNull: false },
    articleId: { type: Sequelize.BIGINT, allowNull: false },
    kind: { type: Sequelize.STRING(32), allowNull: false },
    value: { type: Sequelize.STRING(8), allowNull: false },
    outcome: { type: Sequelize.STRING(16), allowNull: false },
    errorCode: { type: Sequelize.STRING(128), allowNull: true },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  });
  await queryInterface.addIndex('article_sync_actions', ['userId', 'actionId'], {
    name: 'article_sync_actions_user_action_unique', unique: true
  });
}

export async function down() {
  throw new Error('Synchronization receipts prevent duplicate replay. Restore a pre-upgrade backup to roll back.');
}
