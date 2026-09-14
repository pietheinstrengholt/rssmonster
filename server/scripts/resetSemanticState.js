// scripts/resetSemanticState.js
/**
 * Semantic state reset (testing / debugging)
 *
 * Wipes all derived semantic data while leaving feeds and articles intact:
 *   - islands
 *   - events
 *   - Clears article.eventId foreign-key columns
 *
 * Usage:
 *   npm run reset:semantic
 *   node scripts/resetSemanticState.js
 *   node scripts/resetSemanticState.js --userId=3    (single user)
 *   node scripts/resetSemanticState.js --dry-run     (print row counts, no deletes)
 */

import db from '../models/index.js';

const {
  sequelize,
  Article,
  Event,
  Island,
  User
} = db;

const { Op } = db.Sequelize;

/* ------------------------------------------------------------------
 * CLI arg parsing
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = argv.slice(2);
  let userId = null;
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--userId=')) {
      userId = Number(arg.split('=')[1]);
    }
  }

  return { userId, dryRun };
}

/* ------------------------------------------------------------------
 * Core reset logic
 * ------------------------------------------------------------------ */

export async function resetSemanticStateForUser(userId, options = {}) {
  const {
    clearArticleVectors = false,
    clearDuplicateState = false,
    dryRun = false,
    resetInterestScores = false
  } = options;
  const label = `user ${userId}`;

  // Gather IDs scoped to this user
  const [islandRows, eventRows] = await Promise.all([
    Island.findAll({ where: { userId }, attributes: ['id'], raw: true }),
    Event.findAll({ where: { userId }, attributes: ['id'], raw: true }),
  ]);

  const islandIds = islandRows.map(r => r.id);
  const eventIds = eventRows.map(r => r.id);

  const [articleCount, vectorCount, duplicateCount] = await Promise.all([
    Article.count({ where: { userId } }),
    Article.count({ where: { userId, articleVector: { [Op.ne]: null } } }),
    Article.count({ where: { userId, duplicateOfArticleId: { [Op.ne]: null } } })
  ]);

  console.log(`\n[RESET] ${label} — found:`);
  console.log(`  islands       : ${islandIds.length}`);
  console.log(`  events        : ${eventIds.length}`);
  console.log(`  articles      : ${articleCount} (preserved, FK columns cleared)`);
  if (clearArticleVectors) console.log(`  vectors       : ${vectorCount} (cleared)`);
  if (clearDuplicateState) console.log(`  duplicates    : ${duplicateCount} (cleared)`);
  if (resetInterestScores) console.log('  interestScore : reset to 0');

  if (dryRun) {
    console.log(`[RESET] ${label} — DRY RUN, no changes made`);
    return;
  }

  await sequelize.transaction(async (t) => {
    // 2. Islands
    await Island.destroy({ where: { userId }, transaction: t });

    // 5. Events (FK eventId on articles — clear first)
    const articleResetValues = {
      eventId: null,
      ...(clearArticleVectors
        ? { articleVector: null, embedding_model: null }
        : {}),
      ...(clearDuplicateState
        ? {
            duplicateOfArticleId: null,
            duplicateCount: 0,
            status: sequelize.literal(
              "CASE WHEN status = 'duplicate' THEN 'unread' ELSE status END"
            )
          }
        : {}),
      ...(resetInterestScores ? { interestScore: 0 } : {})
    };
    await Article.update(
      articleResetValues,
      { where: { userId }, transaction: t }
    );
    await Event.destroy({ where: { userId }, transaction: t });

  });

  console.log(`[RESET] ${label} — done`);
}

const resetForUser = (userId, dryRun) => resetSemanticStateForUser(userId, { dryRun });

/* ------------------------------------------------------------------
 * Entrypoint
 * ------------------------------------------------------------------ */

async function resetSemanticState({ userId = null, dryRun = false } = {}) {
  if (dryRun) {
    console.log('[RESET] DRY RUN mode — no data will be deleted');
  }

  if (userId) {
    await resetForUser(userId, dryRun);
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(`[RESET] Resetting semantic state for ALL ${users.length} user(s)`);

  for (const user of users) {
    try {
      await resetForUser(user.id, dryRun);
    } catch (err) {
      console.error(`[RESET] Failed for user ${user.id}:`, err);
    }
  }

  console.log('\n[RESET] All done — feeds and articles untouched');
}

export default resetSemanticState;

/* ------------------------------------------------------------------
 * CLI runner
 * ------------------------------------------------------------------ */

if (process.argv[1]?.includes('resetSemanticState')) {
  const { userId, dryRun } = parseArgs(process.argv);

  resetSemanticState({ userId, dryRun })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[RESET] Fatal error:', err);
      process.exit(1);
    });
}
