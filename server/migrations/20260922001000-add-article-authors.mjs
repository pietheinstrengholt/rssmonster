export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('articles');
  if (!columns.authors) await queryInterface.addColumn('articles', 'authors', {
    type: Sequelize.JSON, allowNull: true, defaultValue: null
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('articles', 'authors');
}
