import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const SmartFolder = sequelize.define(
    'smartFolder',
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      /**
       * Advanced search expression
       * Example:
       *   "tag:ai unread:true quality:>0.6"
       */
      query: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      limitCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50
      }
    },
    {
      timestamps: true
    }
  );

  return SmartFolder;
};