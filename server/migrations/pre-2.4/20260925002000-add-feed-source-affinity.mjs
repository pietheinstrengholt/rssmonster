export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('feeds');
  if (!columns.sourceAffinity) await queryInterface.addColumn('feeds', 'sourceAffinity', {
    type: Sequelize.FLOAT, allowNull: true, defaultValue: null
  });
}

export async function down(queryInterface) {
  const columns = await queryInterface.describeTable('feeds');
  if (columns.sourceAffinity) await queryInterface.removeColumn('feeds', 'sourceAffinity');
}
