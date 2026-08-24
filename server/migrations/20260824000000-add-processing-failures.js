'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('processing_failures', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      crawlRunId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'crawl_runs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      executionId: { type: Sequelize.UUID, allowNull: false },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      stage: { type: Sequelize.STRING(64), allowNull: false },
      failureType: {
        type: Sequelize.ENUM(
          'ERROR',
          'TIMEOUT',
          'RATE_LIMITED',
          'UNAVAILABLE',
          'INVALID_DATA',
          'PERSISTENCE_FAILURE',
          'LEASE_LOST',
          'ABANDONED',
          'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'ERROR'
      },
      severity: {
        type: Sequelize.ENUM('WARNING', 'ERROR', 'FATAL'),
        allowNull: false,
        defaultValue: 'ERROR'
      },
      code: { type: Sequelize.STRING(128), allowNull: true, defaultValue: null },
      errorName: { type: Sequelize.STRING(128), allowNull: true, defaultValue: null },
      message: { type: Sequelize.STRING(2000), allowNull: false },
      stackTrace: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      subjectType: { type: Sequelize.STRING(32), allowNull: true, defaultValue: null },
      subjectId: { type: Sequelize.STRING(128), allowNull: true, defaultValue: null },
      feedId: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
      articleId: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
      retryable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      attemptNumber: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
      fingerprint: { type: Sequelize.STRING(64), allowNull: false },
      context: { type: Sequelize.JSON, allowNull: true, defaultValue: null },
      occurredAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addIndex('processing_failures', ['userId', 'occurredAt'], {
      name: 'processing_failures_user_occurred_idx'
    });
    await queryInterface.addIndex('processing_failures', ['crawlRunId', 'occurredAt'], {
      name: 'processing_failures_crawl_occurred_idx'
    });
    await queryInterface.addIndex('processing_failures', ['userId', 'stage', 'occurredAt'], {
      name: 'processing_failures_user_stage_occurred_idx'
    });
    await queryInterface.addIndex('processing_failures', ['userId', 'failureType', 'occurredAt'], {
      name: 'processing_failures_user_type_occurred_idx'
    });
    await queryInterface.addIndex('processing_failures', ['fingerprint', 'occurredAt'], {
      name: 'processing_failures_fingerprint_occurred_idx'
    });
    await queryInterface.addIndex('processing_failures', ['feedId', 'occurredAt'], {
      name: 'processing_failures_feed_occurred_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('processing_failures');
  }
};
