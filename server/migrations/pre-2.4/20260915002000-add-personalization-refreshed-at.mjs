// Unknown refresh history must remain due; technical update times are not evidence.
export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('users');
  if (!columns.personalizationRefreshedAt) await queryInterface.addColumn('users', 'personalizationRefreshedAt', {
    type: Sequelize.DATE, allowNull: true, defaultValue: null
  });
  const indexes = await queryInterface.showIndex('users');
  if (!indexes.some(index => index.name === 'users_personalization_refreshed_at_id')) {
    await queryInterface.addIndex('users', ['personalizationRefreshedAt', 'id'], {
      name: 'users_personalization_refreshed_at_id'
    });
  }
}

export async function down(queryInterface) {
  await queryInterface.removeIndex('users', 'users_personalization_refreshed_at_id');
  await queryInterface.removeColumn('users', 'personalizationRefreshedAt');
}
