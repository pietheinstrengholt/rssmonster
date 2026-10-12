export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('categories');
  if (!columns.clusteringBehavior) await queryInterface.addColumn('categories', 'clusteringBehavior', {
    type: Sequelize.STRING(32), allowNull: true, defaultValue: null
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('categories', 'clusteringBehavior');
}
