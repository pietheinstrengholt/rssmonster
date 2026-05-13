'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('userClusterAffinities', 'starCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'interactionCount'
    });

    await queryInterface.addColumn('userClusterAffinities', 'clickCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'starCount'
    });

    await queryInterface.addColumn('userInterestProfiles', 'starCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'interactionCount'
    });

    await queryInterface.addColumn('userInterestProfiles', 'clickCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'starCount'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('userClusterAffinities', 'starCount');
    await queryInterface.removeColumn('userClusterAffinities', 'clickCount');
    await queryInterface.removeColumn('userInterestProfiles', 'starCount');
    await queryInterface.removeColumn('userInterestProfiles', 'clickCount');
  }
};
