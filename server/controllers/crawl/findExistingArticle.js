import { Op } from 'sequelize';
import db from '../../models/index.js';
const { Article } = db;

/* ======================================================
   Find existing article
   ------------------------------------------------------
   Prevents duplicates based on URL or title+feed+user
====================================================== */
async function findExistingArticle(feed, title, link, contentHash) {
  const orConditions = [];

  // 1. Strongest signal: content hash (if present)
  if (contentHash) {
    orConditions.push({ contentHash });
  }

  // 2. Exact URL match (canonical duplicate)
  if (link) {
    orConditions.push({ url: link });
  }

  // 3. Title match within same feed/user (legacy / media fallback)
  if (title) {
    orConditions.push({
      [Op.and]: [
        { title },
        { feedId: feed.id },
        { userId: feed.userId }
      ]
    });
  }

  if (orConditions.length === 0) {
    return null;
  }

  return Article.findOne({
    where: {
      userId: feed.userId,
      feedId: feed.id,
      [Op.or]: orConditions
    }
  });
}

export default findExistingArticle;