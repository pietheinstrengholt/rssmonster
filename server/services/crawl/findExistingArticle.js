import { Op } from 'sequelize';
import db from '../../models/index.js';
import { normalizeTitleKey } from './articleDuplicateCache.js';

const { Article, sequelize } = db;

// This function finds an existing article with the same stripped content hash for a user.
export async function findByUserContentStrippedHash(identity) {
  if (!identity.contentStrippedHash) return null;

  return Article.findOne({
    attributes: ['id'],
    raw: true,
    where: {
      userId: identity.userId,
      contentStrippedHash: identity.contentStrippedHash
    }
  });
}

// This function finds an existing article with the same content hash for a user.
export async function findByUserContentHash(identity) {
  if (!identity.contentHash) return null;

  return Article.findOne({
    attributes: ['id'],
    raw: true,
    where: {
      userId: identity.userId,
      contentHash: identity.contentHash
    }
  });
}

// This function finds an existing article with the same normalized URL hash in one feed.
export async function findByFeedNormalizedUrlHash(identity) {
  if (!identity.normalizedUrlHash) return null;

  return Article.findOne({
    attributes: ['id'],
    raw: true,
    where: {
      userId: identity.userId,
      feedId: identity.feedId,
      normalizedUrlHash: identity.normalizedUrlHash
    }
  });
}

// This function finds an existing article with the same raw URL hash in one feed.
export async function findByFeedUrlHash(identity) {
  if (!identity.urlHash) return null;

  return Article.findOne({
    attributes: ['id'],
    raw: true,
    where: {
      userId: identity.userId,
      feedId: identity.feedId,
      urlHash: identity.urlHash
    }
  });
}

// This function finds exact title candidates near the candidate publish date in one feed.
export async function findFeedTitleCandidates(identity, windowDays) {
  if (!identity.title || !identity.published || !windowDays) return [];

  const published = new Date(identity.published);
  if (Number.isNaN(published.getTime())) return [];

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const titleKey = normalizeTitleKey(identity.title);
  if (!titleKey) return [];

  return Article.findAll({
    attributes: ['id', 'published'],
    raw: true,
    where: {
      userId: identity.userId,
      feedId: identity.feedId,
      [Op.and]: sequelize.where(
        sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('title'))),
        titleKey
      ),
      published: {
        [Op.between]: [
          new Date(published.getTime() - windowMs),
          new Date(published.getTime() + windowMs)
        ]
      }
    },
    order: [['published', 'DESC'], ['id', 'DESC']],
    limit: 1
  });
}
