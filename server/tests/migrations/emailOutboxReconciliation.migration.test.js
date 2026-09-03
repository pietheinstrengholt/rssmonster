import { createRequire } from 'node:module';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260903000000-reconcile-email-delivery-outbox.js'
);

const indexFieldNames = index => (index?.fields || []).map(field =>
  field.attribute || field.name
);

const currentColumns = () => ({
  payload: { allowNull: false },
  attemptCount: { allowNull: false },
  maxAttempts: { allowNull: false },
  availableAt: { allowNull: false },
  leaseOwner: { allowNull: true },
  leaseUntil: { allowNull: true }
});

const queryInterface = ({ columns = {}, claimFields = ['status', 'scheduledAt'] } = {}) => ({
  addColumn: vi.fn().mockResolvedValue(undefined),
  addIndex: vi.fn().mockResolvedValue(undefined),
  bulkUpdate: vi.fn().mockResolvedValue(undefined),
  changeColumn: vi.fn().mockResolvedValue(undefined),
  describeTable: vi.fn().mockResolvedValue(columns),
  removeIndex: vi.fn().mockResolvedValue(undefined),
  showIndex: vi.fn().mockResolvedValue([{
    name: 'email_deliveries_claim_idx',
    fields: claimFields.map(attribute => ({ attribute }))
  }])
});

describe('email outbox reconciliation migration', () => {
  it('adds missing durable-outbox columns and replaces a stale claim index', async () => {
    const database = queryInterface();

    await migration.up(database, DataTypes);

    expect(database.addColumn.mock.calls.map(([, column]) => column)).toEqual([
      'payload',
      'attemptCount',
      'maxAttempts',
      'availableAt',
      'leaseOwner',
      'leaseUntil'
    ]);
    expect(database.bulkUpdate).toHaveBeenCalledWith(
      'email_deliveries',
      expect.objectContaining({ status: 'failed' }),
      { status: 'pending', payload: null }
    );
    expect(database.changeColumn).toHaveBeenCalledWith(
      'email_deliveries',
      'payload',
      expect.objectContaining({ allowNull: false })
    );
    expect(database.removeIndex).toHaveBeenCalledWith(
      'email_deliveries',
      'email_deliveries_claim_idx'
    );
    expect(database.addIndex).toHaveBeenCalledWith(
      'email_deliveries',
      ['status', 'availableAt', 'leaseUntil', 'id'],
      { name: 'email_deliveries_claim_idx' }
    );
  });

  it('does not alter a database that already has the canonical outbox schema', async () => {
    const claimFields = ['status', 'availableAt', 'leaseUntil', 'id'];
    const database = queryInterface({ columns: currentColumns(), claimFields });

    await migration.up(database, DataTypes);

    expect(database.addColumn).not.toHaveBeenCalled();
    expect(database.bulkUpdate).not.toHaveBeenCalled();
    expect(database.changeColumn).not.toHaveBeenCalled();
    expect(database.removeIndex).not.toHaveBeenCalled();
    expect(database.addIndex).not.toHaveBeenCalled();
  });

  it('upgrades a legacy SQLite delivery table without leaving sendable empty payloads', async () => {
    const database = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const queryInterface = database.getQueryInterface();
    const now = new Date();

    try {
      await queryInterface.createTable('email_deliveries', {
        id: { type: DataTypes.STRING(36), allowNull: false, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        messageType: { type: DataTypes.STRING(64), allowNull: false },
        recipient: { type: DataTypes.STRING(320), allowNull: false },
        status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
        retryCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        scheduledAt: { type: DataTypes.DATE, allowNull: false },
        completedAt: { type: DataTypes.DATE, allowNull: true },
        providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
        lastError: { type: DataTypes.STRING(2000), allowNull: true },
        dedupeKey: { type: DataTypes.STRING(255), allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
      await queryInterface.addIndex(
        'email_deliveries',
        ['status', 'scheduledAt', 'id'],
        { name: 'email_deliveries_claim_idx' }
      );
      await queryInterface.bulkInsert('email_deliveries', [{
        id: 'legacy-email-delivery',
        userId: 1,
        messageType: 'email_verification',
        recipient: 'reader@example.com',
        status: 'pending',
        retryCount: 0,
        scheduledAt: now,
        completedAt: null,
        providerMessageId: null,
        lastError: null,
        dedupeKey: 'legacy-verification',
        createdAt: now,
        updatedAt: now
      }]);

      await migration.up(queryInterface, DataTypes);

      const columns = await queryInterface.describeTable('email_deliveries');
      expect(columns).toEqual(expect.objectContaining({
        payload: expect.objectContaining({ allowNull: false }),
        attemptCount: expect.objectContaining({ allowNull: false }),
        maxAttempts: expect.objectContaining({ allowNull: false }),
        availableAt: expect.objectContaining({ allowNull: false }),
        leaseOwner: expect.objectContaining({ allowNull: true }),
        leaseUntil: expect.objectContaining({ allowNull: true })
      }));
      const [legacy] = await database.query(
        'SELECT status, payload, lastError FROM email_deliveries WHERE id = :id',
        { replacements: { id: 'legacy-email-delivery' }, type: QueryTypes.SELECT }
      );
      expect(legacy.status).toBe('failed');
      expect(legacy.payload).toBeTruthy();
      expect(legacy.lastError).toContain('EMAIL_PAYLOAD_MISSING');
      const claimIndex = (await queryInterface.showIndex('email_deliveries'))
        .find(index => index.name === 'email_deliveries_claim_idx');
      expect(indexFieldNames(claimIndex)).toEqual([
        'status',
        'availableAt',
        'leaseUntil',
        'id'
      ]);
    } finally {
      await database.close();
    }
  });
});
