// Reconstruct legacy activity from Article evidence during calibration, never from updatedAt.
export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('islands');
  if (!columns.lastBehaviorAt) await queryInterface.addColumn('islands', 'lastBehaviorAt', {
    type: Sequelize.DATE, allowNull: true, defaultValue: null
  });
  const indexes = await queryInterface.showIndex('islands');
  if (!indexes.some(index => index.name === 'islands_user_active_behavior_idx')) {
    await queryInterface.addIndex('islands', ['userId', 'archivedInd', 'lastBehaviorAt'], {
      name: 'islands_user_active_behavior_idx'
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeIndex('islands', 'islands_user_active_behavior_idx');
  await queryInterface.removeColumn('islands', 'lastBehaviorAt');
}
