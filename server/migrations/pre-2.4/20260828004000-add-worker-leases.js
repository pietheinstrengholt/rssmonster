'use strict';

module.exports = {
  // Creates the small cross-process lease table used to protect crawl-critical work.
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('worker_leases', {
      key: { type: Sequelize.STRING(64), allowNull: false, primaryKey: true },
      owner: { type: Sequelize.STRING(64), allowNull: false },
      leaseUntil: { type: Sequelize.DATE, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('worker_leases', ['leaseUntil'], {
      name: 'worker_leases_expiry_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('worker_leases');
  }
};
