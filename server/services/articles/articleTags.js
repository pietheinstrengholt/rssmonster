import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

const { Article, Tag, sequelize } = db;

const currentTags = (articleId, userId, transaction) => Tag.findAll({
  where: { articleId, userId },
  attributes: ['id', 'name', 'tagType'],
  order: [['id', 'ASC']],
  transaction
});

// Serialize manual mutations with article updates performed by the crawler.
const mutateArticleTags = (articleId, userId, mutate) => sequelize.transaction(async transaction => {
  const article = await Article.findOne({
    where: { id: articleId, userId, ...canonicalArticleWhere() },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!article || !await mutate(transaction)) return null;
  return currentTags(articleId, userId, transaction);
});

export const addArticleTags = ({ articleId, userId, names }) => mutateArticleTags(
  articleId, userId, async transaction => {
    const existing = await currentTags(articleId, userId, transaction);
    const existingNames = new Set(existing.map(tag => tag.name));
    const additions = names.filter(name => !existingNames.has(name));
    if (additions.length) {
      // An existing assignment retains its provenance, including the rule ranking boost.
      // The unique article/name key also applies the database's established collation.
      await Tag.bulkCreate(additions.map(name => ({ articleId, userId, name, tagType: 'manual' })), {
        ignoreDuplicates: true, transaction
      });
    }
    return true;
  }
);

export const removeArticleTag = ({ articleId, userId, tagId }) => mutateArticleTags(
  articleId, userId, transaction => Tag.destroy({
    where: { id: tagId, articleId, userId },
    transaction
  })
);
