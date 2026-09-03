import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260902003000-add-email-delivery-models.js');

describe('email persistence migration', () => {
  it('adds nullable, uniquely indexed user email identity', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      createTable: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn.mock.calls.slice(0, 3)).toEqual([
      ['users', 'email', expect.objectContaining({
        type: DataTypes.STRING(320),
        allowNull: true,
        defaultValue: null
      })],
      ['users', 'emailVerifiedAt', expect.objectContaining({
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      })],
      ['users', 'passwordChangedAt', expect.objectContaining({
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      })]
    ]);
    expect(queryInterface.addIndex).toHaveBeenCalledWith('users', ['email'], {
      name: 'users_email_unique',
      unique: true
    });
  });

  it('creates hashed token tables with ownership and expiry indexes', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      createTable: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface, DataTypes);

    for (const tableName of ['email_verification_tokens', 'password_reset_tokens']) {
      expect(queryInterface.createTable).toHaveBeenCalledWith(
        tableName,
        expect.objectContaining({
          userId: expect.objectContaining({
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE'
          }),
          tokenHash: expect.objectContaining({
            type: DataTypes.STRING(64),
            allowNull: false
          }),
          expiresAt: expect.objectContaining({ allowNull: false }),
          usedAt: expect.objectContaining({ allowNull: true, defaultValue: null }),
          createdAt: expect.objectContaining({ allowNull: false }),
          updatedAt: expect.objectContaining({ allowNull: false })
        })
      );
      expect(queryInterface.addIndex).toHaveBeenCalledWith(
        tableName,
        ['tokenHash'],
        { name: `${tableName}_hash_unique`, unique: true }
      );
      expect(queryInterface.addIndex).toHaveBeenCalledWith(
        tableName,
        ['userId', 'expiresAt'],
        { name: `${tableName}_user_expiry_idx` }
      );
    }
  });

  it('creates a durable delivery table with daily-digest deduplication support', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      createTable: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'email_deliveries',
      expect.objectContaining({
        userId: expect.objectContaining({ allowNull: false, onDelete: 'CASCADE' }),
        messageType: expect.objectContaining({ allowNull: false }),
        recipient: expect.objectContaining({
          type: DataTypes.STRING(320),
          allowNull: false
        }),
        status: expect.objectContaining({ allowNull: false, defaultValue: 'pending' }),
        payload: expect.objectContaining({ allowNull: false }),
        attemptCount: expect.objectContaining({ allowNull: false, defaultValue: 0 }),
        retryCount: expect.objectContaining({ allowNull: false, defaultValue: 0 }),
        maxAttempts: expect.objectContaining({ allowNull: false, defaultValue: 5 }),
        scheduledAt: expect.objectContaining({ allowNull: false }),
        availableAt: expect.objectContaining({ allowNull: false }),
        leaseOwner: expect.objectContaining({ allowNull: true }),
        leaseUntil: expect.objectContaining({ allowNull: true }),
        completedAt: expect.objectContaining({ allowNull: true }),
        providerMessageId: expect.objectContaining({ allowNull: true }),
        lastError: expect.objectContaining({ allowNull: true }),
        dedupeKey: expect.objectContaining({ allowNull: false })
      })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'email_deliveries',
      ['userId', 'messageType', 'dedupeKey'],
      { name: 'email_deliveries_user_type_dedupe_unique', unique: true }
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'email_deliveries',
      ['status', 'availableAt', 'leaseUntil', 'id'],
      { name: 'email_deliveries_claim_idx' }
    );
  });

  it('rolls back dependent tables before user columns', async () => {
    const queryInterface = {
      dropTable: vi.fn().mockResolvedValue(undefined),
      removeIndex: vi.fn().mockResolvedValue(undefined),
      removeColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.dropTable.mock.calls).toEqual([
      ['email_deliveries'],
      ['password_reset_tokens'],
      ['email_verification_tokens']
    ]);
    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'users',
      'users_email_unique'
    );
    expect(queryInterface.removeColumn.mock.calls).toEqual([
      ['users', 'passwordChangedAt'],
      ['users', 'emailVerifiedAt'],
      ['users', 'email']
    ]);
  });
});
