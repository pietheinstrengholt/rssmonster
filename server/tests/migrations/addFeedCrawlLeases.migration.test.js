import { describe, expect, it, vi } from 'vitest';

import migration from '../../migrations/20260809001000-add-feed-crawl-leases.js';

// Creates the migration type and literal stubs used by contract tests.
const createSequelizeTypes = () => ({
  STRING: vi.fn(length => `STRING(${length})`),
  DATE: 'DATE',
  literal: vi.fn(value => `LITERAL(${value})`)
});

describe('add feed crawl leases migration', () => {
  it('backfills scheduling before adding lease-aware indexes', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      changeColumn: vi.fn().mockResolvedValue(undefined),
      removeIndex: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      sequelize: { query: vi.fn().mockResolvedValue(undefined) }
    };
    const Sequelize = createSequelizeTypes();

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'feeds',
      'leaseUntil',
      { type: 'DATE', allowNull: true, defaultValue: null }
    );
    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'feeds',
      'leaseOwner',
      { type: 'STRING(64)', allowNull: true, defaultValue: null }
    );
    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE `nextFetchAt` IS NULL')
    );
    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'feeds',
      'nextFetchAt',
      expect.objectContaining({
        allowNull: true,
        defaultValue: 'LITERAL(CURRENT_TIMESTAMP)'
      })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'feeds',
      ['status', 'nextFetchAt', 'leaseUntil', 'id'],
      { name: 'feeds_due_claim_idx' }
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'feeds',
      ['userId', 'status', 'nextFetchAt', 'leaseUntil', 'id'],
      { name: 'feeds_user_due_claim_idx' }
    );
  });

  it('removes lease indexes and fields in reverse dependency order', async () => {
    const queryInterface = {
      removeIndex: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      changeColumn: vi.fn().mockResolvedValue(undefined),
      removeColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface, createSequelizeTypes());

    expect(queryInterface.removeIndex).toHaveBeenNthCalledWith(
      1,
      'feeds',
      'feeds_lease_owner_idx'
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledWith(
      'feeds',
      'leaseOwner'
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledWith(
      'feeds',
      'leaseUntil'
    );
  });
});
