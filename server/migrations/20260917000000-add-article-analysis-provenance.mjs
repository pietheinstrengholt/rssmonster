// Legacy analysis cannot be attributed to current publisher content after earlier revisions.
export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('articles');
  if (!columns.aiAnalysisProvenance) await queryInterface.addColumn('articles', 'aiAnalysisProvenance', {
    type: Sequelize.JSON, allowNull: true, defaultValue: null
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('articles', 'aiAnalysisProvenance');
}
