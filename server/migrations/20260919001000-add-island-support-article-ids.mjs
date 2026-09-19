// Legacy Islands acquire support hints during their next normal calibration.
export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('islands');
  if (!columns.supportArticleIds) await queryInterface.addColumn('islands', 'supportArticleIds', {
    type: Sequelize.JSON, allowNull: true, defaultValue: null
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn('islands', 'supportArticleIds');
}
