'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDef = await queryInterface.describeTable('islands');

    if (!tableDef.archivedInd) {
      await queryInterface.addColumn('islands', 'archivedInd', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!tableDef.archivedAt) {
      await queryInterface.addColumn('islands', 'archivedAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    const indexes = await queryInterface.showIndex('islands');
    const hasArchiveIndex = indexes.some(index => index.name === 'islands_user_archived_idx');

    if (!hasArchiveIndex) {
      await queryInterface.addIndex('islands', ['userId', 'archivedInd'], {
        name: 'islands_user_archived_idx'
      });
    }
  },

  down: async (queryInterface) => {
    const indexes = await queryInterface.showIndex('islands');
    const hasArchiveIndex = indexes.some(index => index.name === 'islands_user_archived_idx');

    if (hasArchiveIndex) {
      await queryInterface.removeIndex('islands', 'islands_user_archived_idx');
    }

    const tableDef = await queryInterface.describeTable('islands');

    if (tableDef.archivedAt) {
      await queryInterface.removeColumn('islands', 'archivedAt');
    }

    if (tableDef.archivedInd) {
      await queryInterface.removeColumn('islands', 'archivedInd');
    }
  }
};
