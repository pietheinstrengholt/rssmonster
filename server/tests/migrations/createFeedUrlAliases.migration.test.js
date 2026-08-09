import { describe, expect, it, vi } from 'vitest';
import migration from '../../migrations/20260809002000-create-feed-url-aliases.js';

// Creates migration type stubs that preserve the schema contract for assertions.
const createSequelizeTypes = () => ({
  INTEGER: 'INTEGER',
  STRING_TYPE: 'STRING',
  TEXT: 'TEXT',
  DATE: 'DATE',
  STRING: Object.assign(vi.fn(length => `STRING(${length})`), {
    BINARY: 'STRING BINARY',
    toString: () => 'STRING'
  }),
  ENUM: vi.fn((...values) => `ENUM(${values.join(',')})`),
  literal: vi.fn(value => `LITERAL(${value})`),
  QueryTypes: { SELECT: 'SELECT' }
});

describe('create feed URL aliases migration', () => {
  it('creates ownership, unique identity, lookup indexes, and historical aliases', async () => {
    const queryInterface = {
      createTable: vi.fn().mockResolvedValue(undefined),
      changeColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      addConstraint: vi.fn().mockResolvedValue(undefined),
      bulkInsert: vi.fn().mockResolvedValue(undefined),
      sequelize: {
        query: vi.fn().mockResolvedValue([
          {
            id: 7,
            userId: 4,
            url: 'HTTPS://Example.com:443/a/../feed%2exml#latest',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-02-01T00:00:00Z')
          }
        ])
      }
    };
    const Sequelize = createSequelizeTypes();

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'feeds',
      'url',
      expect.objectContaining({
        allowNull: false,
        type: 'STRING BINARY'
      })
    );

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'feed_url_aliases',
      expect.objectContaining({
        userId: expect.objectContaining({ allowNull: false }),
        feedId: expect.objectContaining({ allowNull: false }),
        originalUrl: expect.objectContaining({ type: 'TEXT', allowNull: false }),
        normalizedUrl: expect.objectContaining({ type: 'TEXT', allowNull: false }),
        normalizedUrlHash: expect.objectContaining({ type: 'STRING(64)' }),
        aliasType: expect.objectContaining({
          type: expect.stringContaining('publisher_self')
        }),
        firstSeenAt: expect.objectContaining({ allowNull: false }),
        lastSeenAt: expect.objectContaining({ allowNull: false })
      }),
      expect.objectContaining({ charset: 'utf8mb4' })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'feed_url_aliases',
      ['userId', 'normalizedUrlHash'],
      { name: 'feed_url_aliases_user_hash_unique', unique: true }
    );
    expect(queryInterface.addConstraint).toHaveBeenCalledWith(
      'feed_url_aliases',
      expect.objectContaining({
        fields: ['feedId', 'userId'],
        references: { table: 'feeds', fields: ['id', 'userId'] }
      })
    );
    expect(queryInterface.bulkInsert).toHaveBeenCalledWith(
      'feed_url_aliases',
      [expect.objectContaining({
        userId: 4,
        feedId: 7,
        normalizedUrl: 'https://example.com/feed.xml',
        aliasType: 'historical'
      })]
    );
  });

  it('keeps the lowest feed ID when legacy aliases already normalize alike', async () => {
    const queryInterface = {
      createTable: vi.fn().mockResolvedValue(undefined),
      changeColumn: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      addConstraint: vi.fn().mockResolvedValue(undefined),
      bulkInsert: vi.fn().mockResolvedValue(undefined),
      sequelize: {
        query: vi.fn().mockResolvedValue([
          { id: 1, userId: 9, url: 'https://EXAMPLE.com/feed#one' },
          { id: 2, userId: 9, url: 'https://example.com:443/feed#two' }
        ])
      }
    };

    await migration.up(queryInterface, createSequelizeTypes());

    const inserted = queryInterface.bulkInsert.mock.calls[0][1];
    expect(inserted).toHaveLength(1);
    expect(inserted[0].feedId).toBe(1);
  });

  it('drops only the new alias table on rollback', async () => {
    const queryInterface = {
      dropTable: vi.fn().mockResolvedValue(undefined),
      changeColumn: vi.fn().mockResolvedValue(undefined)
    };
    await migration.down(queryInterface, createSequelizeTypes());
    expect(queryInterface.dropTable).toHaveBeenCalledWith('feed_url_aliases');
    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'feeds',
      'url',
      expect.objectContaining({ allowNull: false })
    );
  });
});
