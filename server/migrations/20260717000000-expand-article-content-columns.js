'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Expand publisher-controlled article fields that can exceed MySQL TEXT and VARCHAR limits.
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('articles', 'imageUrl', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    for (const columnName of ['description', 'contentHtml', 'contentText']) {
      await queryInterface.changeColumn('articles', columnName, {
        type: Sequelize.TEXT('medium'),
        allowNull: true
      });
    }
  },

  // Restore the former storage limits; rollback fails safely if rows no longer fit.
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('articles', 'imageUrl', {
      type: Sequelize.STRING(1024),
      allowNull: true
    });

    for (const columnName of ['description', 'contentHtml', 'contentText']) {
      await queryInterface.changeColumn('articles', columnName, {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  }
};
