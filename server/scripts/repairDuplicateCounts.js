/**
 * Duplicate counter repair.
 *
 * Rebuilds Article.duplicateCount from duplicateOfArticleId links.
 *
 * Usage:
 *   npm run repair-duplicates
 *   node scripts/repairDuplicateCounts.js
 */

import dotenv from 'dotenv';
dotenv.config();

import db from '../models/index.js';
import { repairDuplicateCounts } from '../services/duplicates/articleDuplicates.js';

const { sequelize } = db;

// This function runs duplicate counter repair from the command line.
export async function repairDuplicateCountsCommand() {
  await sequelize.authenticate();
  const updatedCount = await repairDuplicateCounts();

  console.log(`[DUPLICATES] duplicateCount repair finished updated=${updatedCount}`);

  return { updatedCount };
}

if (process.argv[1]?.includes('repairDuplicateCounts')) {
  repairDuplicateCountsCommand()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[DUPLICATES] duplicateCount repair failed:', err);
      process.exit(1);
    });
}
