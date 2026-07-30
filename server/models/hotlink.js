import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Hotlink = sequelize.define(
    'hotlinks',
    {
      // Identifies the user whose crawled article exposed this outbound URL.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the feed from which this outbound URL was collected.
      feedId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the article containing the outbound URL; null for legacy unlinked records.
      sourceArticleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Stores an outbound URL discovered in the source article.
      url: {
        type: DataTypes.TEXT('medium'),
        allowNull: false
      },
      // Records when the outbound URL was collected; null when legacy data lacks a timestamp.
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  Hotlink.removeAttribute('id');

  return Hotlink;
};
