// scripts/resetSemanticState.js
/**
 * Semantic state reset (testing / debugging)
 *
 * Wipes all derived semantic data while leaving feeds and articles intact:
 *   - island_topics
 *   - islands
 *   - article_topics
 *   - event_topics
 *   - events
 *   - topics
 *   - Clears article.eventId / article.topicId foreign-key columns
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
  Topic,
  Event,
  ArticleTopic,
  EventTopic,
  Island,
  IslandTopic,
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

async function resetForUser(userId, dryRun) {
  const label = `user ${userId}`;

  // Gather IDs scoped to this user
  const [islandRows, eventRows, topicRows] = await Promise.all([
    Island.findAll({ where: { userId }, attributes: ['id'], raw: true }),
    Event.findAll({ where: { userId }, attributes: ['id'], raw: true }),
    Topic.findAll({ where: { userId }, attributes: ['id'], raw: true })
  ]);

  const islandIds = islandRows.map(r => r.id);
  const eventIds = eventRows.map(r => r.id);
  const topicIds = topicRows.map(r => r.id);

  const articleCount = await Article.count({ where: { userId } });

  console.log(`\n[RESET] ${label} — found:`);
  console.log(`  islands       : ${islandIds.length}`);
  console.log(`  island_topics : (scoped via islandIds)`);
  console.log(`  events        : ${eventIds.length}`);
  console.log(`  event_topics  : (scoped via eventIds)`);
  console.log(`  topics        : ${topicIds.length}`);
  console.log(`  article_topics: (scoped via topicIds)`);
  console.log(`  articles      : ${articleCount} (preserved, FK columns cleared)`);

  if (dryRun) {
    console.log(`[RESET] ${label} — DRY RUN, no changes made`);
    return;
  }

  await sequelize.transaction(async (t) => {
    // 1. Island memberships
    if (islandIds.length) {
      await IslandTopic.destroy({
        where: { islandId: { [Op.in]: islandIds } },
        transaction: t
      });
    }

    // 2. Islands
    await Island.destroy({ where: { userId }, transaction: t });

    // 3. Event-topic links
    if (eventIds.length) {
      await EventTopic.destroy({
        where: { eventId: { [Op.in]: eventIds } },
        transaction: t
      });
    }

    // 4. Article-topic links
    if (topicIds.length) {
      await ArticleTopic.destroy({
        where: { topicId: { [Op.in]: topicIds } },
        transaction: t
      });
    }

    // 5. Events (FK eventId on articles — clear first)
    await Article.update(
      { eventId: null, topicId: null },
      { where: { userId }, transaction: t }
    );
    await Event.destroy({ where: { userId }, transaction: t });

    // 6. Topics
    await Topic.destroy({ where: { userId }, transaction: t });
  });

  console.log(`[RESET] ${label} — done`);
}

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
