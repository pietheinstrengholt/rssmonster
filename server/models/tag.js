import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Tag = sequelize.define(
    'tags',
    {
      // Provides the stable identifier for this article tag assignment.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the article carrying this tag.
      articleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the user who owns this tag assignment.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Stores the normalized label displayed and queried as a tag.
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      // Records the tag's origin, such as a rule assignment; null when no origin is recorded.
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
