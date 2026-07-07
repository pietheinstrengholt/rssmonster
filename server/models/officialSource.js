import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const OfficialSource = sequelize.define(
    'official_sources',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      entity: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      domain: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      indexes: [
        { fields: ['userId'] },
        { fields: ['userId', 'entity'] },
        {
          unique: true,
          fields: ['userId', 'domain']
        }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return OfficialSource;
};
