'use strict';

const crypto = require('crypto');

const buildArticleDedupKey = (url) => {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';

    let normalized = parsed.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return crypto
      .createHash('sha256')
      .update(`url:${normalized}`)
      .digest('hex');
  } catch {
    return crypto
      .createHash('sha256')
      .update(`url:${url}`)
      .digest('hex');
  }
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('articles');

    if (!table.dedupKey) {
      await queryInterface.addColumn('articles', 'dedupKey', {
        type: Sequelize.STRING(64),
        allowNull: true
      });
    }

    const rows = await queryInterface.sequelize.query(
      'SELECT id, userId, url FROM articles ORDER BY userId ASC, id ASC',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const firstSeenKeys = new Set();

    for (const row of rows) {
      const dedupKey = buildArticleDedupKey(row.url);
      if (!dedupKey) {
        continue;
      }

      const userScopedKey = `${row.userId}:${dedupKey}`;
      if (firstSeenKeys.has(userScopedKey)) {
        continue;
      }

      firstSeenKeys.add(userScopedKey);

      await queryInterface.bulkUpdate(
        'articles',
        { dedupKey },
        { id: row.id }
      );
    }

    const indexes = await queryInterface.showIndex('articles');
    const hasDedupIndex = indexes.some(index => index.name === 'articles_userId_dedupKey_uidx');

    if (!hasDedupIndex) {
      await queryInterface.addIndex('articles', ['userId', 'dedupKey'], {
        name: 'articles_userId_dedupKey_uidx',
        unique: true
      });
    }
  },

  down: async (queryInterface) => {
    const indexes = await queryInterface.showIndex('articles');
    const hasDedupIndex = indexes.some(index => index.name === 'articles_userId_dedupKey_uidx');

    if (hasDedupIndex) {
      await queryInterface.removeIndex('articles', 'articles_userId_dedupKey_uidx');
    }

    const table = await queryInterface.describeTable('articles');
    if (table.dedupKey) {
      await queryInterface.removeColumn('articles', 'dedupKey');
    }
  }
};