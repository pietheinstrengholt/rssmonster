import { describe, expect, it, vi } from 'vitest';

import migration from '../../migrations/20260809190000-allow-linkless-articles.js';

// This function creates the migration type stub used to inspect URL column intent.
const sequelizeTypes = () => ({
  STRING: vi.fn(length => `STRING:${length}`)
});

describe('allow linkless articles migration', () => {
  it('makes article URL values and their hashes nullable', async () => {
    const queryInterface = { changeColumn: vi.fn().mockResolvedValue() };
    const Sequelize = sequelizeTypes();

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn.mock.calls).toEqual([
      ['articles', 'url', { type: 'STRING:1024', allowNull: true }],
      ['articles', 'urlHash', { type: 'STRING:64', allowNull: true }],
      ['articles', 'normalizedUrl', { type: 'STRING:1024', allowNull: true }],
      ['articles', 'normalizedUrlHash', { type: 'STRING:64', allowNull: true }]
    ]);
  });

  it('refuses a destructive rollback while linkless articles exist', async () => {
    const queryInterface = {
      changeColumn: vi.fn(),
      sequelize: { query: vi.fn().mockResolvedValue([[{ linklessCount: 1 }]]) }
    };

    await expect(migration.down(queryInterface, sequelizeTypes()))
      .rejects.toThrow('linkless articles exist');
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });
});
