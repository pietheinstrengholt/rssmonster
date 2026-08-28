'use strict';

const AI_ANALYSIS_STATUSES = ['pending', 'processing', 'complete', 'skipped', 'failed'];
const INDEX_NAME = 'articles_userId_aiAnalysisStatus_idx';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('articles', 'aiAnalysisStatus', {
      type: Sequelize.ENUM(...AI_ANALYSIS_STATUSES),
      allowNull: false,
      defaultValue: 'complete'
    });
    await queryInterface.addIndex('articles', ['userId', 'aiAnalysisStatus'], {
      name: INDEX_NAME
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('articles', INDEX_NAME);
    await queryInterface.removeColumn('articles', 'aiAnalysisStatus');
  }
};
