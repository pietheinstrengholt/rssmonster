'use strict';

const ADVERTISEMENT_OVERRIDE_FIELD = 'advertisementScoreActionOverrideInd';
const QUALITY_OVERRIDE_FIELD = 'qualityScoreActionOverrideInd';

module.exports = {
  async up(queryInterface, Sequelize) {
    const definition = () => ({
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn('articles', ADVERTISEMENT_OVERRIDE_FIELD, definition());
    await queryInterface.addColumn('articles', QUALITY_OVERRIDE_FIELD, definition());
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('articles', QUALITY_OVERRIDE_FIELD);
    await queryInterface.removeColumn('articles', ADVERTISEMENT_OVERRIDE_FIELD);
  }
};
