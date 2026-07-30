import { Op } from 'sequelize';
import db from '../../../models/index.js';
import { normalizeTitleKey } from './articleDuplicateCache.js';

// Provides the shared dependencies used by this service.
const { Article, sequelize } = db;

// This function finds an existing article with the same visible-text hash for a user.
export async function findByUserContentTextHash(identity) {
  // Returns no result when identity content text hash is unavailable.
  if (!identity.contentTextHash) return null;

  return Article.findOne({
    attributes: ['id'],
    raw: true,
    where: {
      userId: identity.userId,
      contentTextHash: identity.contentTextHash,
      filteredInd: false
    }
  });
}

// This function finds an existing article with the same original source hash for a user.
export async function findByUserContentSourceHash(identity) {
  // Returns no result when identity content source hash is unavailable.
  if (!identity.contentSourceHash) return null;

  return Article.findOne({
    attributes: ['id'],
    raw: true,
    where: {
      userId: identity.userId,
      contentSourceHash: identity.contentSourceHash,
      filteredInd: false
    }
  });
}

// This function finds an existing article with the same normalized URL hash in one feed.
export async function findByFeedNormalizedUrlHash(identity) {
  // Returns no result when identity normalized url hash is unavailable.
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
  // Returns no result when identity url hash is unavailable.
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
  // Returns an empty result when identity title is unavailable or identity published at is unavailable or window days is unavailable.
  if (!identity.title || !identity.publishedAt || !windowDays) return [];

  // Normalizes the published at used while finding feed title candidates.
  const publishedAt = new Date(identity.publishedAt);
  // Returns an empty result when get time is na n.
  if (Number.isNaN(publishedAt.getTime())) return [];

  // Resolves the window ms that governs finding feed title candidates.
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  // Normalizes the title key before finding feed title candidates.
  const titleKey = normalizeTitleKey(identity.title);
  // Returns an empty result when title key is unavailable.
  if (!titleKey) return [];

  return Article.findAll({
    attributes: ['id', 'publishedAt'],
    raw: true,
    where: {
      userId: identity.userId,
      feedId: identity.feedId,
      filteredInd: false,
      [Op.and]: sequelize.where(
        sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('title'))),
        titleKey
      ),
      publishedAt: {
        [Op.between]: [
          new Date(publishedAt.getTime() - windowMs),
          new Date(publishedAt.getTime() + windowMs)
        ]
      }
    },
    order: [['publishedAt', 'DESC'], ['id', 'DESC']],
    limit: 1
  });
}
