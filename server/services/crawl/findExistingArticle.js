import { Op } from 'sequelize';
import { createHash } from 'node:crypto';
import db from '../../models/index.js';
const { Article } = db;

// This function derives the URL hash stored alongside article identity fields.
const hashUrl = url => createHash('sha256').update(url).digest('hex');

/* ======================================================
   Find existing article
   ------------------------------------------------------
   Prevents duplicates based on URL or title+feed+user
====================================================== */
async function findExistingArticle(feed, title, link, contentHash, normalizedUrl = null) {
  // 1. Strongest signal: content hash (search across ALL feeds for this user)
  if (contentHash) {
    const existing = await Article.findOne({
      attributes: ['id'],
      raw: true,
      where: {
        userId: feed.userId,
        contentHash
      }
    });
    if (existing) return existing;
  }

  // 2. & 3. URL or title match (confined to current feed)
  const feedSpecificConditions = [];

  // Exact URL match (canonical duplicate)
  if (link) {
    feedSpecificConditions.push({ url: link });
  }

  if (normalizedUrl) {
    feedSpecificConditions.push({ normalizedUrlHash: hashUrl(normalizedUrl) });
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
