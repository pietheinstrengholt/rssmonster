export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('islands');
  if (!columns.mutedInd) await queryInterface.addColumn('islands', 'mutedInd', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
}

export async function down(queryInterface) {
  const columns = await queryInterface.describeTable('islands');
  if (columns.mutedInd) await queryInterface.removeColumn('islands', 'mutedInd');
}
