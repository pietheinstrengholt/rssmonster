export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('articles');
  if (!columns.originalSource) await queryInterface.addColumn('articles', 'originalSource', {
    type: Sequelize.JSON, allowNull: true, defaultValue: null
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('articles', 'originalSource');
}
