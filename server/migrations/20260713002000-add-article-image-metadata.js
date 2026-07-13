'use strict';

module.exports = {
  // This migration adds metadata for article images.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'imageWidth', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      after: 'imageUrl'
    });

    await queryInterface.addColumn('articles', 'imageHeight', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      after: 'imageWidth'
    });

    await queryInterface.addColumn('articles', 'imageMimeType', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'imageHeight'
    });

    await queryInterface.addColumn('articles', 'imageSource', {
      type: Sequelize.ENUM(
        'media-content',
        'media-thumbnail',
        'enclosure',
        'content',
        'description',
        'publisher'
      ),
      allowNull: true,
      after: 'imageMimeType'
    });
  },

  // This rollback removes the article image metadata.
  down: async queryInterface => {
    await queryInterface.removeColumn('articles', 'imageSource');
    await queryInterface.removeColumn('articles', 'imageMimeType');
    await queryInterface.removeColumn('articles', 'imageHeight');
    await queryInterface.removeColumn('articles', 'imageWidth');
  }
};
