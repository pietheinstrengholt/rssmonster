'use strict';

module.exports = {
  up: async (queryInterface) => {
    const tableDef = await queryInterface.describeTable('events');

    if (tableDef.firstSeen && !tableDef.eventWindowStartAt) {
      await queryInterface.renameColumn('events', 'firstSeen', 'eventWindowStartAt');
    }

    const updatedTableDef = await queryInterface.describeTable('events');

    if (updatedTableDef.lastSeen && !updatedTableDef.eventWindowEndAt) {
      await queryInterface.renameColumn('events', 'lastSeen', 'eventWindowEndAt');
    }
  },

  down: async (queryInterface) => {
    const tableDef = await queryInterface.describeTable('events');

    if (tableDef.eventWindowEndAt && !tableDef.lastSeen) {
      await queryInterface.renameColumn('events', 'eventWindowEndAt', 'lastSeen');
    }

    const updatedTableDef = await queryInterface.describeTable('events');

    if (updatedTableDef.eventWindowStartAt && !updatedTableDef.firstSeen) {
      await queryInterface.renameColumn('events', 'eventWindowStartAt', 'firstSeen');
    }
  }
};
