export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('articles');
  if (!columns.multiIslandScore) await queryInterface.addColumn('articles', 'multiIslandScore', {
    type: Sequelize.FLOAT, allowNull: true, defaultValue: null
  });
}

export async function down() {
  throw new Error('Removing multiIslandScore discards evaluated scores. Restore a verified database backup.');
}
