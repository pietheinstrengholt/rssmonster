'use strict';

const describeTableSafe = async (queryInterface, tableName) => {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return null;
  }
};

const addColumnIfMissing = async (queryInterface, Sequelize, tableName, columnName, afterColumn) => {
  const definition = await describeTableSafe(queryInterface, tableName);
  if (!definition || definition[columnName]) {
    return;
  }

  await queryInterface.addColumn(tableName, columnName, {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0,
    after: afterColumn
  });
};

const removeColumnIfPresent = async (queryInterface, tableName, columnName) => {
  const definition = await describeTableSafe(queryInterface, tableName);
  if (!definition || !definition[columnName]) {
    return;
  }

  await queryInterface.removeColumn(tableName, columnName);
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await addColumnIfMissing(queryInterface, Sequelize, 'userClusterAffinities', 'starCount', 'interactionCount');
    await addColumnIfMissing(queryInterface, Sequelize, 'userClusterAffinities', 'clickCount', 'starCount');

    await addColumnIfMissing(queryInterface, Sequelize, 'userInterestProfiles', 'starCount', 'interactionCount');
    await addColumnIfMissing(queryInterface, Sequelize, 'userInterestProfiles', 'clickCount', 'starCount');
  },

  down: async (queryInterface) => {
    await removeColumnIfPresent(queryInterface, 'userClusterAffinities', 'starCount');
    await removeColumnIfPresent(queryInterface, 'userClusterAffinities', 'clickCount');

    await removeColumnIfPresent(queryInterface, 'userInterestProfiles', 'starCount');
    await removeColumnIfPresent(queryInterface, 'userInterestProfiles', 'clickCount');
  }
};
