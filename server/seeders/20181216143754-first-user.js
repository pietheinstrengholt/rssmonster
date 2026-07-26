'use strict';

const crypto = require('node:crypto');

// This function protects the Fever protocol key before seeding it.
const createFeverCredentialHash = apiKey => {
  if (!process.env.FEVER_CREDENTIAL_SECRET) {
    throw new Error('Missing required env var: FEVER_CREDENTIAL_SECRET');
  }

  return crypto
    .createHmac('sha256', process.env.FEVER_CREDENTIAL_SECRET)
    .update(`rssmonster:fever-api-key:v1:${apiKey}`)
    .digest('hex');
};

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.bulkInsert('users', [{
    username: 'rssmonster',
    password: "$2a$12$1XdLGt8wKPV4YOsrpCHZX.99JD8uWIThKJFBTp/HoZ8PhWHYcr5.q", // 'rssmonster'
    feverCredentialHash: createFeverCredentialHash('24574b626127fcb78f4d122973dcd613'),
    role: 'admin',
    lastLogin: Sequelize.literal('NOW()'),
    createdAt: Sequelize.literal('NOW()'),
    updatedAt: Sequelize.literal('NOW()')
  }], {}),

  down: (queryInterface) => queryInterface.bulkDelete('users', null, {})
};
