'use strict';

const IMAGE_SOURCES = [
  'media-content',
  'media-thumbnail',
  'enclosure',
  'cleaned-content',
  'content',
  'description',
  'publisher'
];

const LEGACY_IMAGE_SOURCES = IMAGE_SOURCES.filter(source => source !== 'cleaned-content');

module.exports = {
  // This migration allows lead images selected from sanitized article content.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('articles', 'imageSource', {
      type: Sequelize.ENUM(...IMAGE_SOURCES),
      allowNull: true
    });
  },

  // This rollback maps sanitized-content sources to their legacy equivalent before narrowing the enum.
  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkUpdate(
      'articles',
      { imageSource: 'content' },
      { imageSource: 'cleaned-content' }
    );
    await queryInterface.changeColumn('articles', 'imageSource', {
      type: Sequelize.ENUM(...LEGACY_IMAGE_SOURCES),
      allowNull: true
    });
  }
};
