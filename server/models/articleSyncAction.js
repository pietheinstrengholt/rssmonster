import { DataTypes } from 'sequelize';

// Receipts outlive their article so a delayed replay cannot become a new action.
export default sequelize => sequelize.define('article_sync_actions', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  actionId: { type: DataTypes.UUID, allowNull: false },
  articleId: { type: DataTypes.BIGINT, allowNull: false },
  kind: { type: DataTypes.STRING(32), allowNull: false },
  value: { type: DataTypes.STRING(8), allowNull: false },
  outcome: { type: DataTypes.STRING(16), allowNull: false },
  errorCode: { type: DataTypes.STRING(128), allowNull: true }
}, {
  indexes: [{ name: 'article_sync_actions_user_action_unique', unique: true, fields: ['userId', 'actionId'] }],
  charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci'
});
