// Null preserves unknown legacy interaction times; never backfill them with migration time.
const fields = ['lastClickedAt', 'favoritedAt', 'positiveFeedbackAt', 'negativeFeedbackAt', 'lastMeaningfulReadAt'];

export async function up(queryInterface, Sequelize) {
  const columns = await queryInterface.describeTable('articles');
  for (const field of fields) {
    if (!columns[field]) await queryInterface.addColumn('articles', field, {
      type: Sequelize.DATE, allowNull: true, defaultValue: null
    });
  }
}

export async function down() {
  throw new Error('Interaction timestamps are behavioral evidence. Restore a pre-upgrade backup to roll back.');
}
