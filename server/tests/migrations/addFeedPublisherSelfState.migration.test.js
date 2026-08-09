import { describe, expect, it, vi } from 'vitest';
import migration from '../../migrations/20260809003000-add-feed-publisher-self-state.js';

// Creates the minimal Sequelize types needed to inspect publisher-self columns.
const createSequelizeTypes = () => ({
  TEXT: 'TEXT',
  DATE: 'DATE',
  STRING: vi.fn(length => `STRING(${length})`)
});

describe('add feed publisher self state migration', () => {
  it('adds nullable diagnostic and validation-cache fields', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      addConstraint: vi.fn().mockResolvedValue(undefined)
    };
    const Sequelize = createSequelizeTypes();

    await migration.up(queryInterface, Sequelize);

    for (const field of [
      'publisherSelfUrl',
      'publisherSelfStatus',
      'publisherSelfCheckedAt',
      'publisherSelfDiagnostic'
    ]) {
      expect(queryInterface.addColumn).toHaveBeenCalledWith(
        'feeds',
        field,
        expect.objectContaining({ allowNull: true, defaultValue: null })
      );
    }
    expect(Sequelize.STRING).toHaveBeenCalledWith(32);
    expect(queryInterface.addConstraint).toHaveBeenCalledWith(
      'feeds',
      expect.objectContaining({
        name: 'feeds_publisherSelfStatus_check',
        type: 'check'
      })
    );
  });

  it('removes the constraint before the cached state columns', async () => {
    const queryInterface = {
      removeConstraint: vi.fn().mockResolvedValue(undefined),
      removeColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.removeConstraint).toHaveBeenCalledWith(
      'feeds',
      'feeds_publisherSelfStatus_check'
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledTimes(4);
    expect(queryInterface.removeConstraint.mock.invocationCallOrder[0]).toBeLessThan(
      queryInterface.removeColumn.mock.invocationCallOrder[0]
    );
  });
});
