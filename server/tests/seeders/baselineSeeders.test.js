import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import Sequelize from 'sequelize';

const require = createRequire(import.meta.url);
const firstFeedSeeder = require('../../seeders/20190118192701-first-feed.js');
const smartFoldersSeeder = require('../../seeders/20240114201700-smartFolders.js');

describe('2.1 baseline seed compatibility', () => {
  // Supplies the required feed JSON value that has no MySQL column default.
  it('seeds the initial feed with explicit empty feed tags', async () => {
    const queryInterface = { bulkInsert: vi.fn().mockResolvedValue(undefined) };

    await firstFeedSeeder.up(queryInterface, Sequelize);

    expect(queryInterface.bulkInsert).toHaveBeenCalledWith(
      'feeds',
      [expect.objectContaining({ feedTags: '[]' })],
      {}
    );
  });

  // Uses the canonical 2.1 smart-folder table for seeding and rollback.
  it('targets the canonical smart_folders table in both directions', async () => {
    const queryInterface = {
      bulkInsert: vi.fn().mockResolvedValue(undefined),
      bulkDelete: vi.fn().mockResolvedValue(undefined)
    };

    await smartFoldersSeeder.up(queryInterface, Sequelize);
    await smartFoldersSeeder.down(queryInterface);

    expect(queryInterface.bulkInsert).toHaveBeenCalledWith(
      'smart_folders',
      expect.any(Array),
      {}
    );
    expect(queryInterface.bulkDelete).toHaveBeenCalledWith(
      'smart_folders',
      expect.any(Object),
      {}
    );
  });
});
