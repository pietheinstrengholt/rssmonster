'use strict';

module.exports = {
  // Adds indexed scheduling and ownership fields for atomic feed claims.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('feeds', 'leaseUntil', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'leaseOwner', {
      type: Sequelize.STRING(64),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.sequelize.query(
      'UPDATE `feeds` SET `nextFetchAt` = CURRENT_TIMESTAMP WHERE `nextFetchAt` IS NULL'
    );
    await queryInterface.changeColumn('feeds', 'nextFetchAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    });
    await queryInterface.removeIndex('feeds', 'feeds_status_nextFetchAt_idx');
    await queryInterface.addIndex(
      'feeds',
      ['status', 'nextFetchAt', 'leaseUntil', 'id'],
      { name: 'feeds_due_claim_idx' }
    );
    await queryInterface.addIndex(
      'feeds',
      ['userId', 'status', 'nextFetchAt', 'leaseUntil', 'id'],
      { name: 'feeds_user_due_claim_idx' }
    );
    await queryInterface.addIndex('feeds', ['leaseOwner'], {
      name: 'feeds_lease_owner_idx'
    });
  },

  // Restores the earlier nullable scheduling contract and index.
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('feeds', 'feeds_lease_owner_idx');
    await queryInterface.removeIndex('feeds', 'feeds_user_due_claim_idx');
    await queryInterface.removeIndex('feeds', 'feeds_due_claim_idx');
    await queryInterface.addIndex('feeds', ['status', 'nextFetchAt'], {
      name: 'feeds_status_nextFetchAt_idx'
    });
    await queryInterface.changeColumn('feeds', 'nextFetchAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.removeColumn('feeds', 'leaseOwner');
    await queryInterface.removeColumn('feeds', 'leaseUntil');
  }
};
