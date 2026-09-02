import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260902002000-create-generated-feeds.js');

describe('Generated Feeds migration', () => {
  it('creates the cross-dialect persistence contract and indexes', async () => {
    const queryInterface = {
      createTable: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'generated_feeds',
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true, allowNull: false }),
        userId: expect.objectContaining({
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        }),
        name: expect.objectContaining({ allowNull: false }),
        description: expect.objectContaining({ allowNull: true, defaultValue: null }),
        expression: expect.objectContaining({ allowNull: false }),
        token: expect.objectContaining({ allowNull: false }),
        enabled: expect.objectContaining({ allowNull: false, defaultValue: true }),
        tokenRegeneratedAt: expect.objectContaining({
          allowNull: false,
          defaultValue: DataTypes.NOW
        }),
        createdAt: expect.objectContaining({ allowNull: false }),
        updatedAt: expect.objectContaining({ allowNull: false })
      })
    );
    expect(queryInterface.addIndex.mock.calls).toEqual([
      ['generated_feeds', ['userId'], {
        name: 'generated_feeds_userId_idx'
      }],
      ['generated_feeds', ['token'], {
        name: 'generated_feeds_token_unique',
        unique: true
      }]
    ]);
  });

  it('drops Generated Feeds on rollback', async () => {
    const queryInterface = { dropTable: vi.fn().mockResolvedValue(undefined) };

    await migration.down(queryInterface);

    expect(queryInterface.dropTable).toHaveBeenCalledWith('generated_feeds');
  });
});
