const indexes = [
  {
    table: 'articles',
    name: 'articles_behavior_read_idx',
    fields: ['userId', 'positiveInd', 'negativeInd', 'favoriteInd', 'filteredInd', 'duplicateOfArticleId', 'lastMeaningfulReadAt', 'attentionBucket']
  },
  {
    table: 'articles',
    name: 'articles_user_status_visible_event_idx',
    fields: ['userId', 'status', 'filteredInd', 'duplicateOfArticleId', 'eventId', 'id']
  },
  {
    table: 'tags',
    name: 'tags_user_article_name_idx',
    fields: ['userId', 'articleId', 'name']
  }
];

export async function up(queryInterface) {
  for (const { table, name, fields } of indexes) {
    // MySQL DDL is not transactional; allow retry after a partially completed migration.
    const existing = await queryInterface.showIndex(table);
    if (!existing.some(index => index.name === name)) {
      await queryInterface.addIndex(table, fields, { name });
    }
  }
}

export async function down(queryInterface) {
  for (const { table, name } of [...indexes].reverse()) {
    const existing = await queryInterface.showIndex(table);
    if (existing.some(index => index.name === name)) {
      await queryInterface.removeIndex(table, name);
    }
  }
}
