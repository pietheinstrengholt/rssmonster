import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Action = sequelize.define(
    'actions',
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
        type: DataTypes.STRING,
        allowNull: false
      },
      actionType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      regularExpression: {
        type: DataTypes.TEXT,
        allowNull: false
      }
    },
    {
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Action;
};