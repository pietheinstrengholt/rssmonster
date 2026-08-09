'use strict';

module.exports = {
  // Removes stale due deadlines so nextFetchAt alone can govern automatic claims.
  up: async queryInterface => {
    await queryInterface.sequelize.query(
      'UPDATE `feeds` SET `nextFetchAt` = NULL WHERE `updateIntervalMinutes` = 0'
    );
  },

  // Restores the legacy disabled-feed deadline representation for rollback compatibility.
  down: async queryInterface => {
    await queryInterface.sequelize.query(
      'UPDATE `feeds` SET `nextFetchAt` = CURRENT_TIMESTAMP WHERE `updateIntervalMinutes` = 0 AND `nextFetchAt` IS NULL'
    );
  }
};
