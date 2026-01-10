import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Category = sequelize.define(
    'categories',
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