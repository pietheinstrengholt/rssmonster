'use strict';

const ARTICLE_TAG_INDEX = 'tags_articleId_name_idx';
const ARTICLE_TAG_UNIQUE = 'tags_articleId_name_unique';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE tags
      SET name = LOWER(TRIM(name))
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM tags
      WHERE name = ''
    `);

    await queryInterface.sequelize.query(`
      DELETE t1 FROM tags t1
      INNER JOIN tags t2
        ON t1.articleId = t2.articleId
        AND t1.name = t2.name
        AND (
          CASE t2.tagType
            WHEN 'rule' THEN 3
            WHEN 'feed' THEN 2
            ELSE 1
          END > CASE t1.tagType
            WHEN 'rule' THEN 3
            WHEN 'feed' THEN 2
            ELSE 1
          END
          OR (
            CASE t2.tagType
              WHEN 'rule' THEN 3
              WHEN 'feed' THEN 2
              ELSE 1
            END = CASE t1.tagType
              WHEN 'rule' THEN 3
              WHEN 'feed' THEN 2
              ELSE 1
            END
            AND t2.id < t1.id
          )
        )
    `);

    await queryInterface.addIndex('tags', ['articleId', 'name'], {
      name: ARTICLE_TAG_UNIQUE,
      unique: true
    });
    await queryInterface.removeIndex('tags', ARTICLE_TAG_INDEX);
  },

  down: async (queryInterface) => {
    await queryInterface.addIndex('tags', ['articleId', 'name'], {
      name: ARTICLE_TAG_INDEX
    });
    await queryInterface.removeIndex('tags', ARTICLE_TAG_UNIQUE);
  }
};
