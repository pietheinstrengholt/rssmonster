import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260828003000-add-article-ai-analysis-completed-at.js');

describe('article AI analysis completion migration', () => {
  it('adds a nullable completion timestamp', async () => {
    const queryInterface = { addColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'articles',
      'aiAnalysisCompletedAt',
      expect.objectContaining({
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      })
    );
  });

  it('removes the completion timestamp on rollback', async () => {
    const queryInterface = { removeColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn).toHaveBeenCalledWith(
      'articles',
      'aiAnalysisCompletedAt'
    );
  });
});
