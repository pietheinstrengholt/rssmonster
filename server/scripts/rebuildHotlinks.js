/**
 * Rebuilds persisted hot article indicators from retained hotlink observations.
 *
 * Usage:
 *   npm run hotlinks
 *   node scripts/rebuildHotlinks.js
 */

import db from '../models/index.js';
import {
  hotArticleCutoffDate
} from '../services/crawl/hot/reconcileHotArticles.js';
import runHotArticleReconciliation from
  '../services/crawl/hot/runHotArticleReconciliation.js';

const { Article, sequelize } = db;

// Runs the same authoritative hotness reconciliation used after crawling.
export async function rebuildHotlinks() {
  await sequelize.authenticate();
  console.log('[HOTLINK] Rebuilding hot article indicators...');

  const userRows = await Article.findAll({
    attributes: ['userId'],
    group: ['userId'],
    raw: true
  });
  const processedUserIds = userRows.map(row => row.userId);
  const result = await runHotArticleReconciliation({
    processedUserIds,
    cutoffDate: hotArticleCutoffDate(),
    continueOnError: false,
    source: 'repair'
  });

  console.log(
    `[HOTLINK] Rebuild completed users=${result.userIds.length} ` +
    `scanned=${result.scannedCount} updated=${result.updatedCount} ` +
    `madeHot=${result.madeHotCount} hot=${result.hotCount} ` +
    `cleared=${result.clearedCount}`
  );

  return result;
}

if (process.argv[1]?.includes('rebuildHotlinks')) {
  rebuildHotlinks()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[HOTLINK] Rebuild failed:', err);
      process.exit(1);
    });
}
