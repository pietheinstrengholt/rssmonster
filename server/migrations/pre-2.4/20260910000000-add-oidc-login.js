'use strict';

// CommonJS is required by the repository's Sequelize migration runner.
module.exports = {
  async up(queryInterface, Sequelize) {
    const userReference = () => ({
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
    });
    const timestamps = () => ({
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.createTable('oidc_identities', {
      identityHash: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      issuer: { type: Sequelize.TEXT, allowNull: false },
      subject: { type: Sequelize.TEXT, allowNull: false },
      userId: { ...userReference(), allowNull: false },
      ...timestamps()
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
    await queryInterface.addIndex('oidc_identities', ['userId']);
    await queryInterface.createTable('oidc_transactions', {
      stateHash: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      browserHash: { type: Sequelize.STRING(64), allowNull: false },
      configurationHash: { type: Sequelize.STRING(64), allowNull: false },
      nonce: { type: Sequelize.STRING(64), allowNull: true },
      codeVerifier: { type: Sequelize.STRING(128), allowNull: true },
      phase: { type: Sequelize.STRING(16), allowNull: false },
      linkUserId: userReference(),
      userId: userReference(),
      passwordVersion: { type: Sequelize.STRING(32), allowNull: true },
      exchangeHash: { type: Sequelize.STRING(64), allowNull: true, unique: true },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      ...timestamps()
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
    await queryInterface.addIndex('oidc_transactions', ['expiresAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('oidc_transactions');
    await queryInterface.dropTable('oidc_identities');
  }
};
