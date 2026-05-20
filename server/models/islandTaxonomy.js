import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const IslandTaxonomy = sequelize.define(
    'IslandTaxonomy',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      identity: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },
      displayName: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      categoryName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      vector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      embedding_model: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'hidden', 'archived'),
        allowNull: false,
        defaultValue: 'active'
      }
    },
    {
      tableName: 'island_taxonomy',
      indexes: [
        {
          unique: true,
          fields: ['identity']
        },
        {
          fields: ['categoryName']
        },
        {
          fields: ['status']
        }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return IslandTaxonomy;
};
