import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260821000000-improve-island-taxonomy-semantics.js');

const queryInterfaceDouble = () => {
  const transaction = {
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined)
  };

  return {
    transaction,
    queryInterface: {
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      bulkInsert: vi.fn().mockResolvedValue(undefined),
      bulkUpdate: vi.fn().mockResolvedValue(undefined),
      sequelize: {
        transaction: vi.fn().mockResolvedValue(transaction)
      }
    }
  };
};

describe('island taxonomy semantics migration', () => {
  it('updates descriptions and invalidates old vectors without changing status', async () => {
    const { queryInterface, transaction } = queryInterfaceDouble();

    await migration.up(queryInterface);

    expect(queryInterface.bulkUpdate).toHaveBeenCalledWith(
      'island_taxonomy',
      expect.objectContaining({
        description: expect.stringContaining('Databases optimized for storing'),
        vector: null,
        embedding_model: null
      }),
      { identity: 'technology-and-computing-vector-databases' },
      { transaction }
    );
    const updateValues = queryInterface.bulkUpdate.mock.calls.map(call => call[1]);
    expect(updateValues.every(values => !Object.hasOwn(values, 'status'))).toBe(true);
    expect(queryInterface.bulkDelete).toHaveBeenCalledWith(
      'island_taxonomy',
      { identity: ['technology-and-computing-rag'] },
      { transaction }
    );
    expect(transaction.commit).toHaveBeenCalledOnce();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('restores the deprecated alias row and removes the newly distinct C++ row on rollback', async () => {
    const { queryInterface, transaction } = queryInterfaceDouble();

    await migration.down(queryInterface);

    expect(queryInterface.bulkDelete).toHaveBeenCalledWith(
      'island_taxonomy',
      { identity: 'technology-and-computing-c-plus-plus' },
      { transaction }
    );
    expect(queryInterface.bulkInsert).toHaveBeenCalledWith(
      'island_taxonomy',
      [expect.objectContaining({
        identity: 'technology-and-computing-rag',
        displayName: 'RAG',
        status: 'active'
      })],
      { ignoreDuplicates: true, transaction }
    );
  });
});
