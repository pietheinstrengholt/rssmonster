'use strict';

// This function returns the ordered column names from a Sequelize index description.
const getIndexColumns = index => index.fields.map(field => field.attribute || field.name);

// This function determines whether an equivalent index already exists on a table.
const hasEquivalentIndex = (indexes, columns) => indexes.some(index => {
  const indexColumns = getIndexColumns(index);
  return indexColumns.length === columns.length && indexColumns.every(
    (column, index) => column === columns[index]
  );
});

// This function adds an index only when no index has the same ordered columns.
const addIndexIfMissing = async (queryInterface, tableName, fields, name) => {
  const indexes = await queryInterface.showIndex(tableName);
  const columns = fields.map(field => typeof field === 'string' ? field : field.name);

  if (hasEquivalentIndex(indexes, columns)) {
    return;
  }

  try {
    await queryInterface.addIndex(tableName, fields, { name });
  } catch (err) {
    // Another deploy may have created the equivalent index after the initial check.
    const currentIndexes = await queryInterface.showIndex(tableName);
    if (!hasEquivalentIndex(currentIndexes, columns)) {
      throw err;
    }
  }
};

// This function removes a named index when it exists.
const removeIndexIfPresent = async (queryInterface, tableName, name) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (indexes.some(index => index.name === name)) {
    await queryInterface.removeIndex(tableName, name);
  }
};

const indexes = [
  {
    tableName: 'articles',
    fields: ['userId', 'contentHash'],
    name: 'articles_user_contenthash_crawl_idx'
  },
  {
    tableName: 'articles',
    fields: ['userId', 'feedId', 'urlHash'],
    name: 'articles_user_feed_urlhash_crawl_idx',
    requiresUrlHash: true
  },
  {
    tableName: 'articles',
    fields: ['userId', 'feedId', { name: 'url', length: 255 }],
    name: 'articles_user_feed_url_crawl_idx'
  },
  {
    tableName: 'articles',
    fields: ['userId', 'feedId', { name: 'title', length: 255 }],
    name: 'articles_user_feed_title_crawl_idx'
  },
  {
    tableName: 'hotlinks',
    fields: ['userId', { name: 'url', length: 255 }],
    name: 'hotlinks_user_url_crawl_idx'
  },
  {
    tableName: 'hotlinks',
    fields: ['userId', 'feedId', { name: 'url', length: 255 }],
    name: 'hotlinks_user_feed_url_crawl_idx'
  },
  {
    tableName: 'actions',
    fields: ['userId'],
    name: 'actions_user_crawl_idx'
  }
];

module.exports = {
  up: async queryInterface => {
    const articleColumns = await queryInterface.describeTable('articles');

    for (const index of indexes) {
      if (index.requiresUrlHash && !articleColumns.urlHash) {
        continue;
      }

      await addIndexIfMissing(
        queryInterface,
        index.tableName,
        index.fields,
        index.name
      );
    }
  },

  down: async queryInterface => {
    for (const index of indexes) {
      await removeIndexIfPresent(queryInterface, index.tableName, index.name);
    }
  }
};
