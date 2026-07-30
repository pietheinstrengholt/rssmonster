import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const IslandTaxonomy = sequelize.define(
    'IslandTaxonomy',
    {
      // Provides the stable identifier for this shared interest taxonomy entry.
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
      },
      // Stores the unique machine-readable identity for the taxonomy concept.
      identity: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },
      // Stores the taxonomy label used to name matching interest islands.
      displayName: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      // Groups the taxonomy concept under a broader category.
      categoryName: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      // Describes the taxonomy concept; null when no description is provided.
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Stores the concept embedding used to label nearby islands; null when unavailable.
      vector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Records which embedding model produced the taxonomy vector; null when unavailable.
      embedding_model: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      // Controls whether the taxonomy entry is active, hidden, or archived.
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
