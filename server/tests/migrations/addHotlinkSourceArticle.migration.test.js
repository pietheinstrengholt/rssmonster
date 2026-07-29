import { describe, expect, it, vi } from 'vitest';

import migration from '../../migrations/20260727000000-add-hotlink-source-article.js';

describe('add hotlink source article migration', () => {
  it('adds nullable article provenance with cascading ownership', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined)
    };
    const Sequelize = { INTEGER: 'INTEGER' };

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'hotlinks',
      'sourceArticleId',
      expect.objectContaining({
        type: 'INTEGER',
        allowNull: true,
        references: {
          model: 'articles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'hotlinks',
      ['sourceArticleId'],
      { name: 'hotlinks_sourceArticleId_idx' }
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'hotlinks',
      ['userId', 'createdAt'],
      { name: 'hotlinks_userId_createdAt_idx' }
    );
  });

  it('removes the provenance index before its column', async () => {
    const queryInterface = {
      removeIndex: vi.fn().mockResolvedValue(undefined),
      removeColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'hotlinks',
      'hotlinks_userId_createdAt_idx'
    );
    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'hotlinks',
      'hotlinks_sourceArticleId_idx'
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledWith(
      'hotlinks',
      'sourceArticleId'
    );
    expect(queryInterface.removeIndex.mock.invocationCallOrder[0]).toBeLessThan(
      queryInterface.removeColumn.mock.invocationCallOrder[0]
    );
  });
});
