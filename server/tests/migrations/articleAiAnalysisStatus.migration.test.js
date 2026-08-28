import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260828002000-add-article-ai-analysis-status.js');

describe('article AI analysis status migration', () => {
  it('preserves historical rows as complete and adds the ownership-state index', async () => {
    const queryInterface = {
      addColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined)
    };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'articles',
      'aiAnalysisStatus',
      expect.objectContaining({
        allowNull: false,
        defaultValue: 'complete',
        type: expect.objectContaining({
          values: ['pending', 'processing', 'complete', 'skipped', 'failed']
        })
      })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'articles',
      ['userId', 'aiAnalysisStatus'],
      { name: 'articles_userId_aiAnalysisStatus_idx' }
    );
  });

  it('removes the index before the status column on rollback', async () => {
    const queryInterface = {
      removeIndex: vi.fn().mockResolvedValue(undefined),
      removeColumn: vi.fn().mockResolvedValue(undefined)
    };

    await migration.down(queryInterface);

    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'articles',
      'articles_userId_aiAnalysisStatus_idx'
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledWith('articles', 'aiAnalysisStatus');
    expect(queryInterface.removeIndex.mock.invocationCallOrder[0]).toBeLessThan(
      queryInterface.removeColumn.mock.invocationCallOrder[0]
    );
  });
});
