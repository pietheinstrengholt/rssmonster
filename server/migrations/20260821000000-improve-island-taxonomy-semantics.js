'use strict';

const {
  deprecatedTaxonomyIdentities,
  taxonomyItems,
  toIdentity
} = require('../seeders/20260520104500-island-taxonomy.js');

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const cPlusPlus = taxonomyItems.find(item =>
        item.categoryName === 'Technology & Computing' && item.displayName === 'C++'
      );
      const now = new Date();
      await queryInterface.bulkInsert('island_taxonomy', [{
        identity: toIdentity(cPlusPlus.categoryName, cPlusPlus.displayName),
        displayName: cPlusPlus.displayName,
        categoryName: cPlusPlus.categoryName,
        description: cPlusPlus.description,
        vector: null,
        embedding_model: null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }], { ignoreDuplicates: true, transaction });

      await queryInterface.bulkDelete(
        'island_taxonomy',
        { identity: deprecatedTaxonomyIdentities },
        { transaction }
      );

      for (const item of taxonomyItems) {
        await queryInterface.bulkUpdate(
          'island_taxonomy',
          {
            description: item.description,
            vector: null,
            embedding_model: null,
            updatedAt: new Date()
          },
          { identity: toIdentity(item.categoryName, item.displayName) },
          { transaction }
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      for (const item of taxonomyItems) {
        await queryInterface.bulkUpdate(
          'island_taxonomy',
          {
            description: null,
            vector: null,
            embedding_model: null,
            updatedAt: new Date()
          },
          { identity: toIdentity(item.categoryName, item.displayName) },
          { transaction }
        );
      }

      await queryInterface.bulkDelete(
        'island_taxonomy',
        { identity: toIdentity('Technology & Computing', 'C++') },
        { transaction }
      );

      const now = new Date();
      await queryInterface.bulkInsert('island_taxonomy', [{
        identity: toIdentity('Technology & Computing', 'RAG'),
        displayName: 'RAG',
        categoryName: 'Technology & Computing',
        description: null,
        vector: null,
        embedding_model: null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }], { ignoreDuplicates: true, transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
