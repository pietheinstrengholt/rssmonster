import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260828004000-add-worker-leases.js');

describe('worker leases migration', () => {
  it('creates and indexes the cross-dialect lease table', async () => {
    const queryInterface = {
      createTable: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined)
    };
    await migration.up(queryInterface, DataTypes);
    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'worker_leases',
      expect.objectContaining({
        key: expect.objectContaining({ primaryKey: true }),
        owner: expect.objectContaining({ allowNull: false }),
        leaseUntil: expect.objectContaining({ allowNull: false })
      })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'worker_leases',
      ['leaseUntil'],
      { name: 'worker_leases_expiry_idx' }
    );
  });
});
