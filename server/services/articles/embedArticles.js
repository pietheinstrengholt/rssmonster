// services/articles/embedArticles.js
import db from '../../models/index.js';
import { Op } from 'sequelize';
import embedArticle from './embedArticle.js';

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

const { Article } = db;
const DEFAULT_BATCH_SIZE = Number.parseInt(process.env.ARTICLE_EMBED_BATCH_SIZE || '200', 10);

// This function backfills embeddings for one user's articles in stable id-ordered batches.
// It delegates vector creation and persistence to embedArticle so storage behavior stays centralized.
export async function embedArticles(userId, options = {}) {
  // Batch size is tunable for memory/latency trade-offs during backfills.
  const batchSize = Number.parseInt(options.batchSize || DEFAULT_BATCH_SIZE, 10);

  let lastId = 0;
  let scannedCount = 0;
  let reusedCount = 0;
  let embeddedCount = 0;
  let skippedCount = 0;

  while (true) {
    const articles = await Article.findAll({
      where: {
        userId,
        id: { [Op.gt]: lastId }
      },
      order: [['id', 'ASC']],
      limit: batchSize,
      attributes: [
        'id',
        'title',
        'description',
        'contentStripped',
        'articleVector',
        'embedding_model'
      ]
    });

    if (!articles.length) break;

    for (const article of articles) {
      scannedCount++;
      lastId = article.id;

      // `embedArticle` handles both reuse checks and persistence.
      const vectors = await embedArticle(article, { persist: true });

      if (!vectors?.eventVector) {
        skippedCount++;
        continue;
      }

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
