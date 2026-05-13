import { Op } from 'sequelize';
import db from '../../models/index.js';
const { Article } = db;
import buildArticleDedupKey from '../../util/buildArticleDedupKey.js';

/* ======================================================
   Find existing article
   ------------------------------------------------------
   Prevents duplicates based on URL or title+feed+user
====================================================== */
async function findExistingArticle(feed, title, link, contentHash) {
  const dedupKey = buildArticleDedupKey(link);

  // 1. Strongest signal: content hash (search across ALL feeds for this user)
  if (contentHash) {
    const existing = await Article.findOne({
      where: {
        userId: feed.userId,
        contentHash
      }
    });
    if (existing) return existing;
  }

  // 2. URL dedup key (search across ALL feeds for this user)
  if (dedupKey) {
    const existing = await Article.findOne({
      where: {
        userId: feed.userId,
        dedupKey
      }
    });
    if (existing) return existing;
  }

  // 3. & 4. Raw URL or title match (confined to current feed)
  const feedSpecificConditions = [];

  // Exact URL match (canonical duplicate)
  if (link) {
    feedSpecificConditions.push({ url: link });
  }

  // Title match within same feed/user (legacy / media fallback)
  if (title) {
    feedSpecificConditions.push({ title });
  }

  if (feedSpecificConditions.length === 0) {
    return null;
  }

  return Article.findOne({
    where: {
      userId: feed.userId,
      feedId: feed.id,
      [Op.or]: feedSpecificConditions
    }
  });
}

export default findExistingArticle;