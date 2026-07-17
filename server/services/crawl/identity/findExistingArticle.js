import { Op } from 'sequelize';
import db from '../../../models/index.js';
import { normalizeTitleKey } from './articleDuplicateCache.js';

const { Article, sequelize } = db;

// This function finds an existing article with the same visible-text hash for a user.
export async function findByUserContentTextHash(identity) {
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
  if (!identity.title || !identity.publishedAt || !windowDays) return [];

  const publishedAt = new Date(identity.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) return [];

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const titleKey = normalizeTitleKey(identity.title);
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
