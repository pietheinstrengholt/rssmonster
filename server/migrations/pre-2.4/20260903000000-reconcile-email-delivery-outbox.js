'use strict';

const TABLE_NAME = 'email_deliveries';
const CLAIM_INDEX = 'email_deliveries_claim_idx';
const CLAIM_FIELDS = ['status', 'availableAt', 'leaseUntil', 'id'];
const LEGACY_PAYLOAD = JSON.stringify({
  subject: 'Legacy email delivery',
  text: 'This delivery was created before message payload persistence was enabled.',
  html: '<p>This delivery was created before message payload persistence was enabled.</p>'
});

const fieldNames = index => (index?.fields || []).map(field =>
  field.attribute || field.name
);

const sameFields = (left, right) =>
  left.length === right.length && left.every((field, index) => field === right[index]);

// Reconciles databases that applied the initial email migration before the durable
// outbox gained payload, attempt, availability, and lease columns.
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable(TABLE_NAME);
    const now = new Date();

    if (!columns.payload) {
      await queryInterface.addColumn(TABLE_NAME, 'payload', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
    if (!columns.payload || columns.payload.allowNull !== false) {
      for (const status of ['pending', 'sending']) {
        await queryInterface.bulkUpdate(TABLE_NAME, {
          status: 'failed',
          completedAt: now,
          lastError: 'EMAIL_PAYLOAD_MISSING: legacy delivery cannot be sent'
        }, { status, payload: null });
      }
      await queryInterface.bulkUpdate(
        TABLE_NAME,
        { payload: LEGACY_PAYLOAD },
        { payload: null }
      );
      await queryInterface.changeColumn(TABLE_NAME, 'payload', {
        type: Sequelize.JSON,
        allowNull: false
      });
    }

    if (!columns.attemptCount) {
      await queryInterface.addColumn(TABLE_NAME, 'attemptCount', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
    if (!columns.maxAttempts) {
      await queryInterface.addColumn(TABLE_NAME, 'maxAttempts', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5
      });
    }
    if (!columns.availableAt) {
      await queryInterface.addColumn(TABLE_NAME, 'availableAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    if (!columns.availableAt || columns.availableAt.allowNull !== false) {
      await queryInterface.bulkUpdate(TABLE_NAME, { availableAt: now }, { availableAt: null });
      await queryInterface.changeColumn(TABLE_NAME, 'availableAt', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      });
    }
    if (!columns.leaseOwner) {
      await queryInterface.addColumn(TABLE_NAME, 'leaseOwner', {
        type: Sequelize.STRING(64),
        allowNull: true,
        defaultValue: null
      });
    }
    if (!columns.leaseUntil) {
      await queryInterface.addColumn(TABLE_NAME, 'leaseUntil', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      });
    }

    const indexes = await queryInterface.showIndex(TABLE_NAME);
    const existingClaimIndex = indexes.find(index => index.name === CLAIM_INDEX);
    if (existingClaimIndex && !sameFields(fieldNames(existingClaimIndex), CLAIM_FIELDS)) {
      await queryInterface.removeIndex(TABLE_NAME, CLAIM_INDEX);
    }
    if (!existingClaimIndex || !sameFields(fieldNames(existingClaimIndex), CLAIM_FIELDS)) {
      await queryInterface.addIndex(TABLE_NAME, CLAIM_FIELDS, { name: CLAIM_INDEX });
    }
  },

  // This compatibility migration may be a no-op on a fresh database because the
  // canonical creation migration already owns these columns. Removing them on
  // rollback would therefore corrupt the canonical schema.
  async down() {}
};
