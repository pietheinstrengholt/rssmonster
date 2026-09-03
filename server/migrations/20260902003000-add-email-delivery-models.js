'use strict';

const EMAIL_DELIVERY_STATUSES = ['pending', 'sending', 'sent', 'failed', 'cancelled'];

module.exports = {
  // Adds optional user email identity and durable token and delivery persistence.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'email', {
      type: Sequelize.STRING(320),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('users', 'emailVerifiedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('users', 'passwordChangedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addIndex('users', ['email'], {
      name: 'users_email_unique',
      unique: true
    });

    await queryInterface.createTable('email_verification_tokens', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tokenHash: { type: Sequelize.STRING(64), allowNull: false },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      usedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('email_verification_tokens', ['tokenHash'], {
      name: 'email_verification_tokens_hash_unique',
      unique: true
    });
    await queryInterface.addIndex('email_verification_tokens', ['userId', 'expiresAt'], {
      name: 'email_verification_tokens_user_expiry_idx'
    });

    await queryInterface.createTable('password_reset_tokens', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tokenHash: { type: Sequelize.STRING(64), allowNull: false },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      usedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('password_reset_tokens', ['tokenHash'], {
      name: 'password_reset_tokens_hash_unique',
      unique: true
    });
    await queryInterface.addIndex('password_reset_tokens', ['userId', 'expiresAt'], {
      name: 'password_reset_tokens_user_expiry_idx'
    });

    await queryInterface.createTable('email_deliveries', {
      id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      messageType: { type: Sequelize.STRING(64), allowNull: false },
      recipient: { type: Sequelize.STRING(320), allowNull: false },
      status: {
        type: Sequelize.ENUM(...EMAIL_DELIVERY_STATUSES),
        allowNull: false,
        defaultValue: 'pending'
      },
      payload: { type: Sequelize.JSON, allowNull: false },
      attemptCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      retryCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      maxAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      availableAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      leaseOwner: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      leaseUntil: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      completedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      providerMessageId: {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: null
      },
      lastError: { type: Sequelize.STRING(2000), allowNull: true, defaultValue: null },
      dedupeKey: { type: Sequelize.STRING(255), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex(
      'email_deliveries',
      ['userId', 'messageType', 'dedupeKey'],
      { name: 'email_deliveries_user_type_dedupe_unique', unique: true }
    );
    await queryInterface.addIndex(
      'email_deliveries',
      ['status', 'availableAt', 'leaseUntil', 'id'],
      { name: 'email_deliveries_claim_idx' }
    );
    await queryInterface.addIndex(
      'email_deliveries',
      ['userId', 'status', 'scheduledAt'],
      { name: 'email_deliveries_user_status_idx' }
    );
  },

  // Removes email persistence before removing the user identity columns it owns.
  async down(queryInterface) {
    await queryInterface.dropTable('email_deliveries');
    await queryInterface.dropTable('password_reset_tokens');
    await queryInterface.dropTable('email_verification_tokens');
    await queryInterface.removeIndex('users', 'users_email_unique');
    await queryInterface.removeColumn('users', 'passwordChangedAt');
    await queryInterface.removeColumn('users', 'emailVerifiedAt');
    await queryInterface.removeColumn('users', 'email');
  }
};
