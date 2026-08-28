'use strict';

const JOB_STATUSES = ['pending', 'running', 'succeeded', 'dead', 'cancelled'];

module.exports = {
  // Creates the durable queue shared by MySQL and SQLite deployments.
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('processing_jobs', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true
      },
      type: { type: Sequelize.STRING(64), allowNull: false },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      articleId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: { model: 'articles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      dedupeKey: { type: Sequelize.STRING(255), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: Sequelize.ENUM(...JOB_STATUSES),
        allowNull: false,
        defaultValue: 'pending'
      },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      maxAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
      availableAt: { type: Sequelize.DATE, allowNull: false },
      leaseOwner: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      leaseUntil: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastErrorCode: { type: Sequelize.STRING(128), allowNull: true, defaultValue: null },
      lastErrorMessage: { type: Sequelize.STRING(2000), allowNull: true, defaultValue: null },
      startedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      completedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addIndex('processing_jobs', ['userId', 'type', 'dedupeKey'], {
      name: 'processing_jobs_user_type_dedupe_unique',
      unique: true
    });
    await queryInterface.addIndex(
      'processing_jobs',
      ['status', 'priority', 'createdAt', 'availableAt', 'id'],
      { name: 'processing_jobs_claim_idx' }
    );
    await queryInterface.addIndex(
      'processing_jobs',
      ['status', 'leaseUntil', 'id'],
      { name: 'processing_jobs_lease_recovery_idx' }
    );
    await queryInterface.addIndex(
      'processing_jobs',
      ['userId', 'status', 'availableAt'],
      { name: 'processing_jobs_user_status_available_idx' }
    );
    await queryInterface.addIndex(
      'processing_jobs',
      ['userId', 'articleId', 'status'],
      { name: 'processing_jobs_user_article_status_idx' }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('processing_jobs');
  }
};
