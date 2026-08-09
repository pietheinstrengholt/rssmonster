'use strict';

const { createHash } = require('node:crypto');

const ALIAS_TYPES = [
  'input',
  'discovered_alternate',
  'redirect',
  'final',
  'publisher_self',
  'manual',
  'historical'
];

// Identifies bytes whose literal and percent-encoded forms are comparison-equivalent.
const isUnreservedByte = byte =>
  (byte >= 0x41 && byte <= 0x5a) ||
  (byte >= 0x61 && byte <= 0x7a) ||
  (byte >= 0x30 && byte <= 0x39) ||
  [0x2d, 0x2e, 0x5f, 0x7e].includes(byte);

// Mirrors the initial application normalizer so existing feed URLs receive usable aliases.
const normalizeHistoricalUrl = input => {
  const url = new URL(String(input || '').trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Unsupported historical feed URL');
  }
  url.hash = '';
  return url.href.replace(/%[0-9a-f]{2}/gi, escape => {
    const byte = Number.parseInt(escape.slice(1), 16);
    return isUnreservedByte(byte)
      ? String.fromCharCode(byte)
      : `%${escape.slice(1).toUpperCase()}`;
  });
};

// Produces the fixed-width identity used by the user-scoped unique guard.
const hashNormalizedUrl = normalizedUrl => createHash('sha256')
  .update(normalizedUrl, 'utf8')
  .digest('hex');

module.exports = {
  // Creates and conservatively backfills user-scoped feed URL history.
  up: async (queryInterface, Sequelize) => {
    // Preserves the legacy exact-URL guard without folding case-sensitive paths.
    await queryInterface.changeColumn('feeds', 'url', {
      type: Sequelize.STRING.BINARY,
      allowNull: false
    });
    await queryInterface.createTable('feed_url_aliases', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      feedId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'feeds', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      originalUrl: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      normalizedUrl: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      normalizedUrlHash: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      aliasType: {
        type: Sequelize.ENUM(...ALIAS_TYPES),
        allowNull: false
      },
      firstSeenAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      lastSeenAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    await queryInterface.addIndex(
      'feed_url_aliases',
      ['userId', 'normalizedUrlHash'],
      { name: 'feed_url_aliases_user_hash_unique', unique: true }
    );
    await queryInterface.addIndex(
      'feed_url_aliases',
      ['userId', 'feedId'],
      { name: 'feed_url_aliases_user_feed_idx' }
    );
    await queryInterface.addIndex('feed_url_aliases', ['feedId'], {
      name: 'feed_url_aliases_feed_idx'
    });
    await queryInterface.addIndex(
      'feed_url_aliases',
      ['userId', 'aliasType'],
      { name: 'feed_url_aliases_user_type_idx' }
    );
    await queryInterface.addConstraint('feed_url_aliases', {
      fields: ['feedId', 'userId'],
      type: 'foreign key',
      name: 'feed_url_aliases_feedId_userId_fkey',
      references: { table: 'feeds', fields: ['id', 'userId'] },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    const feeds = await queryInterface.sequelize.query(
      'SELECT `id`, `userId`, `url`, `createdAt`, `updatedAt` FROM `feeds` ORDER BY `userId`, `id`',
      { type: Sequelize.QueryTypes.SELECT }
    );
    const claimedIdentities = new Set();
    const aliases = [];
    for (const feed of feeds) {
      try {
        const normalizedUrl = normalizeHistoricalUrl(feed.url);
        const normalizedUrlHash = hashNormalizedUrl(normalizedUrl);
        const identityKey = `${feed.userId}:${normalizedUrlHash}`;
        // Existing equivalent duplicate rows are left for a later explicit merge workflow.
        if (claimedIdentities.has(identityKey)) continue;
        claimedIdentities.add(identityKey);
        aliases.push({
          userId: feed.userId,
          feedId: feed.id,
          originalUrl: feed.url,
          normalizedUrl,
          normalizedUrlHash,
          aliasType: 'historical',
          firstSeenAt: feed.createdAt || new Date(),
          lastSeenAt: feed.updatedAt || feed.createdAt || new Date()
        });
      } catch {
        // Invalid legacy URLs remain fetchable but cannot participate in alias identity.
      }
    }
    if (aliases.length > 0) {
      await queryInterface.bulkInsert('feed_url_aliases', aliases);
    }
  },

  // Removes feed URL identity history without changing existing feed rows.
  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('feeds', 'url', {
      type: Sequelize.STRING,
      allowNull: false
    });
    await queryInterface.dropTable('feed_url_aliases');
  }
};
