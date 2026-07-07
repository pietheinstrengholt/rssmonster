'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'isOfficialSource', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'contentHash'
    });

    await queryInterface.addColumn('articles', 'officialOrganization', {
      type: Sequelize.STRING(128),
      allowNull: true,
      defaultValue: null,
      after: 'isOfficialSource'
    });

    await queryInterface.addIndex('articles', ['userId', 'isOfficialSource', 'published'], {
      name: 'articles_userId_isOfficialSource_published_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_userId_isOfficialSource_published_idx');
    await queryInterface.removeColumn('articles', 'officialOrganization');
    await queryInterface.removeColumn('articles', 'isOfficialSource');
  }
};
