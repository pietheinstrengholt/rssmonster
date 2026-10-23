export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('articles');
  if (!columns.semanticAffinityScore) await queryInterface.addColumn('articles', 'semanticAffinityScore', {
    type: Sequelize.FLOAT, allowNull: true, defaultValue: null
  });
}

export async function down() {
  throw new Error('Removing semanticAffinityScore discards evaluated scores. Restore a verified database backup.');
}
