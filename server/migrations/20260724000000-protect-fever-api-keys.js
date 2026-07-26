'use strict';

const crypto = require('node:crypto');

const FEVER_CREDENTIAL_CONTEXT = 'rssmonster:fever-api-key:v1:';

// This function protects one legacy Fever API key with the application secret.
const createFeverCredentialHash = apiKey => {
  if (!process.env.FEVER_CREDENTIAL_SECRET) {
    throw new Error('Missing required env var: FEVER_CREDENTIAL_SECRET');
  }

  return crypto
    .createHmac('sha256', process.env.FEVER_CREDENTIAL_SECRET)
    .update(`${FEVER_CREDENTIAL_CONTEXT}${apiKey}`)
    .digest('hex');
};

module.exports = {
  // This migration replaces directly stored Fever API keys with keyed hashes.
  up: async queryInterface => {
    await queryInterface.sequelize.transaction(async transaction => {
      const [users] = await queryInterface.sequelize.query(
        'SELECT id, hash FROM users',
        { transaction }
      );

      for (const user of users) {
        await queryInterface.bulkUpdate(
          'users',
          { hash: createFeverCredentialHash(user.hash) },
          { id: user.id },
          { transaction }
        );
      }
    });
  },

  // This security transformation cannot recover the previously stored API keys.
  down: async () => {
    throw new Error(
      'The Fever API key protection migration cannot be reversed safely'
    );
  }
};
