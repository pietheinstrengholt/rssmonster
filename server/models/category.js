import { DataTypes } from 'sequelize';

export const CATEGORY_CLUSTERING_BEHAVIORS = ['aggressive', 'moderate', 'conservative'];

export default (sequelize) => {
  const Category = sequelize.define(
    'categories',
    {
      // Provides the stable identifier for this feed category.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the user who owns this category and its feeds.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Stores the category label shown in feed navigation.
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      // Selects the Bootstrap icon shown for the category; null when no icon is configured.
      iconName: {
        type: DataTypes.STRING,
        allowNull: true
      },
      // Stores the Event clustering preference; null uses the server/default EVENT_SIM_THRESHOLD.
      clusteringBehavior: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null,
        validate: { isIn: [CATEGORY_CLUSTERING_BEHAVIORS] }
      },
      // Controls the category's relative display position, defaulting to the first order value.
      categoryOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Category;
};
