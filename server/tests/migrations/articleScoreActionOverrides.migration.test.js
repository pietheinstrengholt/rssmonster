import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260828005000-add-article-score-action-overrides.js'
);

describe('article score action provenance migration', () => {
  it('adds false-by-default provenance for historical rows', async () => {
    const queryInterface = { addColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.up(queryInterface, DataTypes);

    for (const field of [
      'advertisementScoreActionOverrideInd',
      'qualityScoreActionOverrideInd'
    ]) {
      expect(queryInterface.addColumn).toHaveBeenCalledWith(
        'articles',
        field,
        expect.objectContaining({
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        })
      );
    }
  });

  it('removes both provenance fields on rollback', async () => {
    const queryInterface = { removeColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn.mock.calls).toEqual([
      ['articles', 'qualityScoreActionOverrideInd'],
      ['articles', 'advertisementScoreActionOverrideInd']
    ]);
  });
});
