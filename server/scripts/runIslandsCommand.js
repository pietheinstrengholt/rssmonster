// scripts/runIslandsCommand.js
/**
 * Islands command runner.
 *
 * Scope:
 *   npm run islands recalibrates Interest Islands and then refreshes article scores.
 *
 * Usage:
 *   npm run islands
 *   node scripts/runIslandsCommand.js
 *
 * Programmatic usage:
 *   runIslandCalibration({ userId })
 */

import { runIslandCalibration } from '../services/islands/runIslandCalibration.js';

export default runIslandCalibration;

if (process.argv[1]?.includes('runIslandsCommand')) {
  runIslandCalibration()
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


