import { createRequire } from 'node:module';
import { DataTypes } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260902001000-add-crawl-filtered-counts.js'
);

describe('crawl filtered count migration', () => {
  it('adds filtered counters to crawl result tables', async () => {
    const queryInterface = { addColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.up(queryInterface, DataTypes);

    expect(queryInterface.addColumn).toHaveBeenNthCalledWith(
      1,
      'crawl_runs',
      'articlesFiltered',
      { type: DataTypes.INTEGER, allowNull: true, defaultValue: null }
    );
    expect(queryInterface.addColumn).toHaveBeenNthCalledWith(
      2,
      'feed_crawl_results',
      'articlesFiltered',
      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    );
  });

  it('removes filtered counters in reverse order', async () => {
    const queryInterface = { removeColumn: vi.fn().mockResolvedValue(undefined) };

    await migration.down(queryInterface);

    expect(queryInterface.removeColumn.mock.calls).toEqual([
      ['feed_crawl_results', 'articlesFiltered'],
      ['crawl_runs', 'articlesFiltered']
    ]);
  });
});
