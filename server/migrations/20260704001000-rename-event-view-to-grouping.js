'use strict';

const legacyEventColumn = ['event', 'View'].join('');
const legacyClusterColumn = ['cluster', 'View'].join('');
const legacyEventValue = ['event', 'Cluster'].join('');

const columnExists = async (queryInterface, columnName) => {
  const table = await queryInterface.describeTable('settings');
  return Boolean(table[columnName]);
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Rename the persisted article grouping preference to the generic grouping name.
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'grouping'))) {
      if (await columnExists(queryInterface, legacyEventColumn)) {
        await queryInterface.renameColumn('settings', legacyEventColumn, 'grouping');
      } else if (await columnExists(queryInterface, legacyClusterColumn)) {
        await queryInterface.renameColumn('settings', legacyClusterColumn, 'grouping');
      }
    }

    await queryInterface.changeColumn('settings', 'grouping', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'none'
    });
    await queryInterface.sequelize.query(`
      UPDATE \`settings\`
      SET \`grouping\` = CASE
        WHEN \`grouping\` = '${legacyEventValue}' THEN 'event'
        WHEN \`grouping\` = 'all' THEN 'none'
        ELSE \`grouping\`
      END
    `);
  },

  // Restore the previous column name for rollback compatibility.
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE \`settings\`
      SET \`grouping\` = CASE
        WHEN \`grouping\` = 'event' THEN '${legacyEventValue}'
        WHEN \`grouping\` = 'none' THEN 'all'
        ELSE \`grouping\`
      END
    `);
    await queryInterface.changeColumn('settings', 'grouping', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'all'
    });
    await queryInterface.renameColumn('settings', 'grouping', legacyEventColumn);
  }
};
