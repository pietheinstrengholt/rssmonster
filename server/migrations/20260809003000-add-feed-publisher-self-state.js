'use strict';

const SELF_STATUS_VALUES = [
  'validated',
  'known_alias',
  'invalid',
  'security_rejected',
  'unreachable',
  'malformed',
  'unrelated'
];

module.exports = {
  // Adds durable publisher-self validation state without changing active feed URLs.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('feeds', 'publisherSelfUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'publisherSelfStatus', {
      type: Sequelize.STRING(32),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'publisherSelfCheckedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'publisherSelfDiagnostic', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addConstraint('feeds', {
      fields: ['publisherSelfStatus'],
      type: 'check',
      name: 'feeds_publisherSelfStatus_check',
      where: {
        publisherSelfStatus: SELF_STATUS_VALUES
      }
    });
  },

  // Removes only the publisher-self validation cache and diagnostics.
  down: async queryInterface => {
    await queryInterface.removeConstraint('feeds', 'feeds_publisherSelfStatus_check');
    await queryInterface.removeColumn('feeds', 'publisherSelfDiagnostic');
    await queryInterface.removeColumn('feeds', 'publisherSelfCheckedAt');
    await queryInterface.removeColumn('feeds', 'publisherSelfStatus');
    await queryInterface.removeColumn('feeds', 'publisherSelfUrl');
  }
};
