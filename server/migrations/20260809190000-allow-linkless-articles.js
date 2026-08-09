'use strict';

// This migration permits stable-ID feed entries that do not expose an external article URL.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('articles', 'url', {
      type: Sequelize.STRING(1024),
      allowNull: true
    });
    await queryInterface.changeColumn('articles', 'urlHash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });
    await queryInterface.changeColumn('articles', 'normalizedUrl', {
      type: Sequelize.STRING(1024),
      allowNull: true
    });
    await queryInterface.changeColumn('articles', 'normalizedUrlHash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS linklessCount
      FROM articles
      WHERE url IS NULL
         OR urlHash IS NULL
         OR normalizedUrl IS NULL
         OR normalizedUrlHash IS NULL
    `);
    if (Number(rows?.[0]?.linklessCount || 0) > 0) {
      throw new Error('Cannot restore non-null article URLs while linkless articles exist');
    }
    await queryInterface.changeColumn('articles', 'url', {
      type: Sequelize.STRING(1024),
      allowNull: false
    });
    await queryInterface.changeColumn('articles', 'urlHash', {
      type: Sequelize.STRING(64),
      allowNull: false
    });
    await queryInterface.changeColumn('articles', 'normalizedUrl', {
      type: Sequelize.STRING(1024),
      allowNull: false
    });
    await queryInterface.changeColumn('articles', 'normalizedUrlHash', {
      type: Sequelize.STRING(64),
      allowNull: false
    });
  }
};
