#!/usr/bin/env node
/**
 * Merge Interest Profiles - Maintenance Script
 *
 * Consolidates near-duplicate semantic interest islands for all users.
 * Useful for periodic maintenance to reduce recommendation fragmentation.
 *
 * Usage:
 *   npm run merge-profiles              # all users
 *   npm run merge-profiles -- --userId=42    # specific user
 *
 * Environment:
 *   NODE_ENV=production                 # recommended for production runs
 *   PROFILE_MERGE_THRESHOLD=0.88        # override default threshold
 */

import db from '../models/index.js';
import { mergeAllInterestProfiles, mergeInterestProfilesForUser } from '../util/interestProfileMerge.service.js';

const { sequelize } = db;

const args = process.argv.slice(2);
const userIdArg = args.find(arg => arg.startsWith('--userId='));
const userId = userIdArg ? Number(userIdArg.split('=')[1]) : null;

async function main() {
  try {
    // Ensure DB connection
    await sequelize.authenticate();

    console.log('\n[MERGE] Starting interest profile merge pass...\n');

    let result;

    if (userId) {
      console.log(`[MERGE] Merging profiles for specific user: ${userId}`);
      result = await mergeInterestProfilesForUser(userId);
      console.log(`[MERGE] User ${userId}: ${result.before} -> ${result.after} profiles (${result.mergedCount} merged)\n`);
    } else {
      console.log('[MERGE] Merging profiles for all users...');
      result = await mergeAllInterestProfiles();
      console.log(`[MERGE] Total: ${result.totalBefore} -> ${result.totalAfter} profiles (${result.totalMerged} merged across ${result.totalUsers} users)\n`);
    }

    console.log('[MERGE] Completed successfully\n');
    process.exit(0);
  } catch (err) {
    console.error('[MERGE] Error:', err);
    process.exit(1);
  }
}

main();
