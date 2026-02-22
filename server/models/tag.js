import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Tag = sequelize.define(
    'tags',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      articleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      tagType: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Tag;
};