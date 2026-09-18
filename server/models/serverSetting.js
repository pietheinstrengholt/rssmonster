import { DataTypes } from 'sequelize';

export default sequelize => sequelize.define('server_settings', {
  key: { type: DataTypes.STRING(100), primaryKey: true, allowNull: false },
  value: { type: DataTypes.JSON, allowNull: false }
}, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
