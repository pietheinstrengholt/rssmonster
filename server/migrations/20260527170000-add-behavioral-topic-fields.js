'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('topics', 'topicType', {
      type: Sequelize.ENUM('event', 'behavioral', 'hybrid'),
      allowNull: false,
      defaultValue: 'event',
      after: 'topicVector'
    });

    await queryInterface.addColumn('topics', 'evidenceScore', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
      after: 'affinityScore'
    });

    await queryInterface.addColumn('topics', 'behavioralArticleCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'articleCount'
    });

    await queryInterface.addColumn('topics', 'lastBehaviorAt', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'lastActivityAt'
    });

    await queryInterface.addIndex('topics', ['userId', 'topicType'], {
      name: 'topics_userId_topicType_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('topics', 'topics_userId_topicType_idx');
    await queryInterface.removeColumn('topics', 'lastBehaviorAt');
    await queryInterface.removeColumn('topics', 'behavioralArticleCount');
    await queryInterface.removeColumn('topics', 'evidenceScore');
    await queryInterface.removeColumn('topics', 'topicType');
  }
};
