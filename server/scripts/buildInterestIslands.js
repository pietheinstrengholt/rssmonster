// scripts/buildInterestIslands.js
/**
 * Interest Islands CLI runner
 *
 * Usage:
 *   npm run islands
 *   node scripts/buildInterestIslands.js
 *
 * Programmatic usage:
 *   buildInterestIslands({ userId })
 */

import { buildInterestIslands } from '../services/islands/buildInterestIslands.js';

export default buildInterestIslands;

if (process.argv[1]?.includes('buildInterestIslands')) {
  buildInterestIslands()
    .then((result) => {
      if (result?.userCount != null) {
        console.log(`[ISLANDS] Processed ${result.userCount} users`);
      }
      console.log('[ISLANDS] Done');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ISLANDS] Failed:', err);
      process.exit(1);
    });
}
