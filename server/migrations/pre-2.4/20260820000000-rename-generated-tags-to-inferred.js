'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE tags
      SET tagType = 'inferred'
      WHERE tagType = 'generated'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE tags
      SET tagType = 'generated'
      WHERE tagType = 'inferred'
    `);
  }
};
