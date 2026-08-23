// services/articles/embedArticles.js
import db from '../../models/index.js';
import { Op } from 'sequelize';
import embedArticle from './embedArticle.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { shouldSkipArticleEmbeddings } from '../../config/intelligentFeatures.js';

/**
 * Backfill runner for article vectors.
 *
 * Responsibilities:
 * 1) Scan a user's articles in batches.
 * 2) Call `embedArticle` for each row.
 * 3) Report summary counters (scanned/reused/embedded/skipped).
 *
 * This module orchestrates batch processing only; persistence is delegated to
 * `embedArticle` so storage logic is not duplicated.
 */

// Provides the shared dependencies used by this service.
const { Article, Feed } = db;
// Defines the default batch size enforced by this service.
const DEFAULT_BATCH_SIZE = Number.parseInt(process.env.ARTICLE_EMBED_BATCH_SIZE || '200', 10);
// Defines the default max age days enforced by this service.
const DEFAULT_MAX_AGE_DAYS = Number.parseInt(process.env.ARTICLE_EMBED_MAX_AGE_DAYS || '7', 10);

// This function resolves the oldest article creation time eligible for vector creation.
function resolveCreatedAtFrom(options = {}) {
  // Returns early when options created at from is available.
  if (options.createdAtFrom) return options.createdAtFrom;
  // Returns no result when options max age days is value.
  if (options.maxAgeDays === null) return null;

  // Parses the int while resolving created at from.
  const maxAgeDays = Number.parseInt(
    options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
    10
  );

  // Returns no result when max age days is not finite or max age days is at most value.
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return null;

  return new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
}

// This function backfills embeddings for one user's articles in stable id-ordered batches.
// It delegates vector creation and persistence to embedArticle so storage behavior stays centralized.
export async function embedArticles(userId, options = {}) {
  if (shouldSkipArticleEmbeddings()) {
    return {
      userId,
      scannedCount: 0,
      reusedCount: 0,
      embeddedCount: 0,
      skippedCount: 0
    };
  }

  // Batch size is tunable for memory/latency trade-offs during backfills.
  const batchSize = Number.parseInt(options.batchSize || DEFAULT_BATCH_SIZE, 10);
  // Resolves the created at from while performing embed articles.
  const createdAtFrom = resolveCreatedAtFrom(options);
  // Collects the article id while performing embed articles.
  const articleIds = [...new Set((options.articleIds || []).filter(Boolean))];

  let lastId = 0;
  let scannedCount = 0;
  let reusedCount = 0;
  let embeddedCount = 0;
  let skippedCount = 0;

  // Repeats this processing step while eligible work remains.
  while (true) {
    // Selects the articles based on whether article id is non-empty.
    const articles = await Article.findAll({
      where: {
        userId,
        id: {
          [Op.gt]: lastId,
          ...(articleIds.length ? { [Op.in]: articleIds } : {})
        },
        ...canonicalArticleWhere(),
        filteredInd: false,
        articleVector: { [Op.is]: null },
        ...(createdAtFrom ? { createdAt: { [Op.gte]: createdAtFrom } } : {})
      },
      include: [{
        model: Feed,
        attributes: [],
        required: true,
        where: {
          generateEmbeddings: true
        }
      }],
      order: [['id', 'ASC']],
      limit: batchSize,
      attributes: [
        'id',
        'title',
        'description',
        'contentText',
        'articleVector',
        'embedding_model'
      ]
    });

    // Stops collecting values when articles is empty.
    if (!articles.length) break;

    // Processes each articles entry in turn.
    for (const article of articles) {
      scannedCount++;
      lastId = article.id;

      // `embedArticle` handles both reuse checks and persistence.
      const vectors = await embedArticle(article, { persist: true });

      // Handles the case where event vector is unavailable.
      if (!vectors?.eventVector) {
        skippedCount++;
        continue;
      }

      // Handles the case where vectors reused is available.
      if (vectors.reused) {
        reusedCount++;
      } else {
        embeddedCount++;
      }
    }
  }

  return {
    userId,
    scannedCount,
    reusedCount,
    embeddedCount,
    skippedCount
  };
}

// Compatibility export during rename transition
export const embedArticlesForUser = embedArticles;

export default embedArticles;
