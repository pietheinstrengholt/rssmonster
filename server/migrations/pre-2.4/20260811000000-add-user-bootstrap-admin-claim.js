'use strict';

module.exports = {
  // Adds the unique claim used to serialize first-user administrator assignment.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'bootstrapAdminClaim', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addConstraint('users', {
      fields: ['bootstrapAdminClaim'],
      type: 'unique',
      name: 'users_bootstrap_admin_claim_unique'
    });
  },

  // Removes the bootstrap claim and its uniqueness invariant.
  async down(queryInterface) {
    await queryInterface.removeConstraint(
      'users',
      'users_bootstrap_admin_claim_unique'
    );
    await queryInterface.removeColumn('users', 'bootstrapAdminClaim');
  }
};
