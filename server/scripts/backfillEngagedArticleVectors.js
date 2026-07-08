/**
 * Backfill vectors for engaged articles that do not have an articleVector yet.
 *
 * Usage:
 *   node scripts/backfillEngagedArticleVectors.js
 *   node scripts/backfillEngagedArticleVectors.js --dry-run
 *   node scripts/backfillEngagedArticleVectors.js --userId=3
 *   node scripts/backfillEngagedArticleVectors.js --batchSize=100
 *   node scripts/backfillEngagedArticleVectors.js --limit=500
 */

import dotenv from 'dotenv';
dotenv.config();

import { Op } from 'sequelize';
import db from '../models/index.js';
import embedArticle from '../services/articles/embedArticle.js';

const { Article, sequelize } = db;

const DEFAULT_BATCH_SIZE = Number.parseInt(
  process.env.ENGAGED_VECTOR_BACKFILL_BATCH_SIZE || '100',
  10
);

// This function parses supported command-line options.
function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    limit: null,
    userId: null
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--batchSize=')) {
      options.batchSize = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--userId=')) {
      options.userId = Number(arg.split('=')[1]);
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('--batchSize must be a positive integer');
  }

  if (
    options.limit !== null &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  ) {
    throw new Error('--limit must be a positive integer');
  }

  if (
    options.userId !== null &&
    (!Number.isInteger(options.userId) || options.userId < 1)
  ) {
    throw new Error('--userId must be a positive integer');
  }

  return options;
}

// This function builds the narrow backfill filter for missing engaged vectors.
function buildTargetWhere({ userId = null, afterId = null } = {}) {
  const where = {
    articleVector: null,
    [Op.or]: [
      { favoriteInd: 1 },
      { positiveInd: 1 },
      { negativeInd: 1 },
      { clickedAmount: { [Op.gt]: 0 } }
    ]
  };

  if (userId) {
    where.userId = userId;
  }

  if (afterId !== null) {
    where.id = { [Op.gt]: afterId };
  }

  return where;
}

// This function fetches the next stable id-ordered page of target articles.
async function fetchBatch({ userId, afterId, batchSize }) {
  return Article.findAll({
    where: buildTargetWhere({ userId, afterId }),
    order: [['id', 'ASC']],
    limit: batchSize,
    attributes: [
      'id',
      'userId',
      'title',
      'description',
      'contentText',
      'articleVector',
      'embedding_model',
      'favoriteInd',
      'positiveInd',
      'negativeInd',
      'clickedAmount'
    ]
  });
}

// This function backfills only engaged articles that are missing vectors.
export async function backfillEngagedArticleVectors(options = {}) {
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    dryRun = false,
    limit = null,
    userId = null
  } = options;

  await sequelize.authenticate();

  const targetCount = await Article.count({
    where: buildTargetWhere({ userId })
  });

  console.log(
    `[VECTOR BACKFILL] targets=${targetCount}` +
    `${userId ? ` userId=${userId}` : ''}` +
    `${limit ? ` limit=${limit}` : ''}`
  );

  if (dryRun) {
    console.log('[VECTOR BACKFILL] DRY RUN, no embeddings requested or saved');
    return {
      targetCount,
      scannedCount: 0,
      embeddedCount: 0,
      skippedCount: 0
    };
  }

  let lastId = 0;
  let scannedCount = 0;
  let embeddedCount = 0;
  let skippedCount = 0;

  while (limit === null || scannedCount < limit) {
    const remaining = limit === null
      ? batchSize
      : Math.min(batchSize, limit - scannedCount);

    const articles = await fetchBatch({
      userId,
      afterId: lastId,
      batchSize: remaining
    });

    if (!articles.length) break;

    for (const article of articles) {
      lastId = article.id;
      scannedCount++;

      const result = await embedArticle(article, {
        allowShortEventText: true,
        persist: true
      });

      if (result?.eventVector && !result.reused) {
        embeddedCount++;
      } else {
        skippedCount++;
      }

      if (scannedCount % batchSize === 0) {
        console.log(
          `[VECTOR BACKFILL] scanned=${scannedCount} ` +
          `embedded=${embeddedCount} skipped=${skippedCount} lastId=${lastId}`
        );
      }
    }
  }

  console.log(
    `[VECTOR BACKFILL] done scanned=${scannedCount} ` +
    `embedded=${embeddedCount} skipped=${skippedCount}`
  );

  return {
    targetCount,
    scannedCount,
    embeddedCount,
    skippedCount
  };
}

export default backfillEngagedArticleVectors;

if (process.argv[1]?.includes('backfillEngagedArticleVectors')) {
  const options = parseArgs(process.argv);

  backfillEngagedArticleVectors(options)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[VECTOR BACKFILL] Fatal error:', err);
      process.exit(1);
    });
}
