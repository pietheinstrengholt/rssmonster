export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('archiving_settings', {
    id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    neverDeleteUnreadArticles: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    neverDeleteFavorites: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    neverDeleteClickedArticles: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    maximumArticleAge: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 7 },
    maximumArticleAgeUnit: {
      type: Sequelize.ENUM('days', 'weeks', 'months', 'years'),
      allowNull: false,
      defaultValue: 'days'
    },
    // Null means no configured article-count limit.
    maximumArticlesPerFeed: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
    maximumArticlesTotal: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });

  await queryInterface.addIndex('archiving_settings', ['userId'], {
    name: 'archiving_settings_userId_unique',
    unique: true
  });
};

export const down = queryInterface => queryInterface.dropTable('archiving_settings');
