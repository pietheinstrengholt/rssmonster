import { DataTypes } from 'sequelize';

export default sequelize => {
  const InferenceSetting = sequelize.define('inference_settings', {
    id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, defaultValue: 1, validate: { isIn: [[1]] } },
    baseUrl: { type: DataTypes.STRING(2048), allowNull: false },
    apiKeyEncrypted: { type: DataTypes.TEXT, allowNull: true }
  }, {
    defaultScope: { attributes: { exclude: ['apiKeyEncrypted'] } },
    charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci'
  });
  InferenceSetting.prototype.toJSON = function () {
    const metadata = { ...this.get({ plain: true }) };
    delete metadata.apiKeyEncrypted;
    return metadata;
  };
  return InferenceSetting;
};
