// Do not infer scoring history from Article.updatedAt or a default zero interest score.
export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('articles');
  if (!columns.interestScoredAt) await queryInterface.addColumn('articles', 'interestScoredAt', {
    type: Sequelize.DATE, allowNull: true, defaultValue: null
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('articles', 'interestScoredAt');
}
