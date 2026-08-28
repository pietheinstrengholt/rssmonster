import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260828001000-add-processing-jobs.js');

describe('processing jobs migration', () => {
  it('creates the cross-dialect durable job contract and indexes', async () => {
    const queryInterface = {
      createTable: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'processing_jobs',
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true, allowNull: false }),
        userId: expect.objectContaining({
          allowNull: false,
          references: { model: 'users', key: 'id' }
        }),
        articleId: expect.objectContaining({
          allowNull: true,
          references: { model: 'articles', key: 'id' },
          onDelete: 'SET NULL'
        }),
        payload: expect.objectContaining({ allowNull: false }),
        status: expect.objectContaining({
          allowNull: false,
          defaultValue: 'pending'
        }),
        availableAt: expect.objectContaining({ allowNull: false }),
        leaseOwner: expect.objectContaining({ allowNull: true }),
        leaseUntil: expect.objectContaining({ allowNull: true }),
        createdAt: expect.objectContaining({ allowNull: false }),
        updatedAt: expect.objectContaining({ allowNull: false })
      })
    );
    expect(queryInterface.addIndex.mock.calls).toEqual([
      ['processing_jobs', ['userId', 'type', 'dedupeKey'], {
        name: 'processing_jobs_user_type_dedupe_unique',
        unique: true
      }],
      ['processing_jobs', ['status', 'priority', 'createdAt', 'availableAt', 'id'], {
        name: 'processing_jobs_claim_idx'
      }],
      ['processing_jobs', ['status', 'leaseUntil', 'id'], {
        name: 'processing_jobs_lease_recovery_idx'
      }],
      ['processing_jobs', ['userId', 'status', 'availableAt'], {
        name: 'processing_jobs_user_status_available_idx'
      }],
      ['processing_jobs', ['userId', 'articleId', 'status'], {
        name: 'processing_jobs_user_article_status_idx'
      }]
    ]);
  });

  it('drops the queue table on rollback', async () => {
    const queryInterface = {
      dropTable: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.dropTable).toHaveBeenCalledWith('processing_jobs');
  });
});
