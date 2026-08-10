import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const SmartFolder = sequelize.define(
    'smartFolder',
    {
      // Provides the stable identifier for this saved smart folder.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the user who owns and can execute this smart folder.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Stores the user-facing name of the saved search.
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      // Stores the advanced article-search expression evaluated by the smart folder.
      query: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      // Caps the number of matching articles returned, defaulting to 50.
      limitCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50
      }
    },
    {
      tableName: 'smart_folders',
      timestamps: true
    }
  );

  return SmartFolder;
};
