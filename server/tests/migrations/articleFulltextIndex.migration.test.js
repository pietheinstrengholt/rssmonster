import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('../../migrations/20260811002000-add-article-title-content-text-fulltext-index.js');

const queryInterfaceFor = dialect => ({
  addIndex: vi.fn().mockResolvedValue(undefined),
  removeIndex: vi.fn().mockResolvedValue(undefined),
  sequelize: { getDialect: vi.fn().mockReturnValue(dialect) }
});

describe('article title and content text full-text index migration', () => {
  it('adds and removes the combined MySQL FULLTEXT index', async () => {
    const queryInterface = queryInterfaceFor('mysql');

    await migration.up(queryInterface);
    await migration.down(queryInterface);

    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'articles',
      ['title', 'contentText'],
      {
        name: 'articles_title_contentText_fulltext_idx',
        type: 'FULLTEXT'
      }
    );
    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'articles',
      'articles_title_contentText_fulltext_idx'
    );
  });

  it('leaves SQLite unchanged because FTS requires a synchronized virtual table', async () => {
    const queryInterface = queryInterfaceFor('sqlite');

    await migration.up(queryInterface);
    await migration.down(queryInterface);

    expect(queryInterface.addIndex).not.toHaveBeenCalled();
    expect(queryInterface.removeIndex).not.toHaveBeenCalled();
  });
});
