import { describe, expect, it, vi } from 'vitest';

import migration from '../../migrations/20260809170000-add-article-description-derivatives.js';

// This function creates the migration type stub used to inspect column intent.
const sequelizeTypes = () => ({
  TEXT: vi.fn(length => `TEXT:${length}`)
});

describe('article description derivatives migration', () => {
  it('adds nullable sanitized and text description columns in storage order', async () => {
    const queryInterface = { addColumn: vi.fn().mockResolvedValue() };
    const Sequelize = sequelizeTypes();

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenNthCalledWith(1, 'articles', 'descriptionHtml', {
      type: 'TEXT:medium',
      allowNull: true,
      defaultValue: null,
      after: 'description'
    });
    expect(queryInterface.addColumn).toHaveBeenNthCalledWith(2, 'articles', 'descriptionText', {
      type: 'TEXT:medium',
      allowNull: true,
      defaultValue: null,
      after: 'descriptionHtml'
    });
  });

  it('removes dependent columns in reverse order', async () => {
    const queryInterface = { removeColumn: vi.fn().mockResolvedValue() };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn.mock.calls).toEqual([
      ['articles', 'descriptionText'],
      ['articles', 'descriptionHtml']
    ]);
  });
});
