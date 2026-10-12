const name = 'articles_user_visible_created_idx';

export async function up(queryInterface) {
  const indexes = await queryInterface.showIndex('articles');
  if (!indexes.some(index => index.name === name)) {
    await queryInterface.addIndex('articles', ['userId', 'filteredInd', 'duplicateOfArticleId', 'createdAt'], { name });
  }
}

export async function down(queryInterface) {
  const indexes = await queryInterface.showIndex('articles');
  if (indexes.some(index => index.name === name)) {
    await queryInterface.removeIndex('articles', name);
  }
}
