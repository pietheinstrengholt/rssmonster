import { DataTypes } from 'sequelize';

export default sequelize => sequelize.define('SidebarSetting', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  showFeedFavicons: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  showTotalCount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  automaticallyHideInactiveFeeds: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  inactiveFeedDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30, validate: { isIn: [[30, 60, 90]] } },
  hideZeroCountItems: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sortByCurrentSelection: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sortOrder: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'manual', validate: { isIn: [['manual', 'name', 'selectedCount', 'totalCount', 'recentlyActive', 'personalInterests']] } },
  sectionOrder: { type: DataTypes.JSON, allowNull: true },
  declutterCounts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  tableName: 'sidebar_settings',
  indexes: [{ name: 'sidebar_settings_userId_unique', unique: true, fields: ['userId'] }],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
