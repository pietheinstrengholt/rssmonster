import { Op } from 'sequelize';
import Article from '../../models/article.js';

/* ======================================================
   Find existing article
   ------------------------------------------------------
   Prevents duplicates based on URL or title+feed+user
====================================================== */
async function findExistingArticle(feed, title, link) {
  return Article.findOne({
    where: {
      [Op.or]: [
        { url: link },
        {
          [Op.and]: [
            { title },
            { feedId: feed.id },
            { userId: feed.userId }
          ]
        }
      ]
    }
  });
}

export default findExistingArticle;
