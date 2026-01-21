'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.bulkInsert(
    'smartFolders',
    [
      {
        userId: 1,
        name: 'Top Stories Today',
        query: '@today unread:true cluster:true sort:IMPORTANCE',
        limitCount: 30,
        createdAt: Sequelize.literal('NOW()'),
        updatedAt: Sequelize.literal('NOW()')
      },
      {
        userId: 1,
        name: 'Worth Your Time',
        query: 'unread:true quality:>0.65 cluster:true sort:QUALITY',
        limitCount: 25,
        createdAt: Sequelize.literal('NOW()'),
        updatedAt: Sequelize.literal('NOW()')
      },
      {
        userId: 1,
        name: 'Quick Scan',
        query: '@today unread:true cluster:true quality:>0.4 sort:IMPORTANCE',
        limitCount: 40,
        createdAt: Sequelize.literal('NOW()'),
        updatedAt: Sequelize.literal('NOW()')
      },
      {
        userId: 1,
        name: 'Low Noise Mode',
        query: 'unread:true cluster:true quality:>0.75 freshness:>=0.4 sort:IMPORTANCE',
        limitCount: 15,
        createdAt: Sequelize.literal('NOW()'),
        updatedAt: Sequelize.literal('NOW()')
      }
    ],
    {}
  ),
  down: async (queryInterface) => queryInterface.bulkDelete(
    'smartFolders',
    {
      name: [
        'Top Stories Today',
        'Worth Your Time',
        'Quick Scan',
        'Low Noise Mode'
      ]
    },
    {}
  )
};