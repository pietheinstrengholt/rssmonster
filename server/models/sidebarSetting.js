import { DataTypes } from 'sequelize';

export default sequelize => sequelize.define('SidebarSetting', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  showTotalCount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  declutterCounts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  tableName: 'sidebar_settings',
  indexes: [{ name: 'sidebar_settings_userId_unique', unique: true, fields: ['userId'] }],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
