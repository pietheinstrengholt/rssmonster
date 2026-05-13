/**
 * Cleanup duplicate articles by normalized URL per user.
 *
 * Default mode is DRY RUN (no writes).
 * Use --apply to execute changes.
 * Optional: --userId=<id> to scope cleanup to a single user.
 *
 * Examples:
 *   node scripts/cleanupDuplicateArticles.js
 *   node scripts/cleanupDuplicateArticles.js --apply
 *   node scripts/cleanupDuplicateArticles.js --apply --userId=42
 */

import db from '../models/index.js';
import normalizeUrl from '../util/normalizeUrl.js';
import { Op } from 'sequelize';

const { Article, Tag, ArticleCluster, sequelize } = db;

const CHUNK_SIZE = 500;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const userArg = args.find(arg => arg.startsWith('--userId='));
  const userId = userArg ? Number(userArg.split('=')[1]) : null;

  if (userArg && !Number.isFinite(userId)) {
    throw new Error(`Invalid --userId value: ${userArg}`);
  }

  return { apply, userId };
};

const chunk = (arr, size) => {
  const chunks = [];
  for (let index = 0; index < arr.length; index += size) {
    chunks.push(arr.slice(index, index + size));
  }
  return chunks;
};

const toEpoch = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const chooseKeeper = (rows, representativeIds) => {
  const sorted = [...rows].sort((left, right) => {
    const leftIsRep = representativeIds.has(left.id) ? 1 : 0;
    const rightIsRep = representativeIds.has(right.id) ? 1 : 0;
    if (leftIsRep !== rightIsRep) return rightIsRep - leftIsRep;

    if ((left.starInd || 0) !== (right.starInd || 0)) {
      return (right.starInd || 0) - (left.starInd || 0);
    }

    if ((left.clickedAmount || 0) !== (right.clickedAmount || 0)) {
      return (right.clickedAmount || 0) - (left.clickedAmount || 0);
    }

    const leftPublished = toEpoch(left.published);
    const rightPublished = toEpoch(right.published);
    if (leftPublished !== rightPublished) return rightPublished - leftPublished;

    const leftCreated = toEpoch(left.createdAt);
    const rightCreated = toEpoch(right.createdAt);
    if (leftCreated !== rightCreated) return rightCreated - leftCreated;

    return (right.id || 0) - (left.id || 0);
  });

  return sorted[0];
};

const buildPlan = (articles, representativeIds) => {
  const groups = new Map();

  for (const article of articles) {
    const normalizedUrl = normalizeUrl(article.url);
    if (!normalizedUrl) continue;

    const key = `${article.userId}:${normalizedUrl}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(article);
  }

  const duplicateGroups = [];
  const replacements = new Map();
  const deleteIds = [];

  for (const [groupKey, rows] of groups.entries()) {
    if (rows.length < 2) continue;

    const keeper = chooseKeeper(rows, representativeIds);
    const toDelete = rows.filter(row => row.id !== keeper.id);

    for (const duplicate of toDelete) {
      replacements.set(duplicate.id, keeper.id);
      deleteIds.push(duplicate.id);
    }

    duplicateGroups.push({
      groupKey,
      count: rows.length,
      keeperId: keeper.id,
      deleteIds: toDelete.map(row => row.id),
      sampleUrl: rows[0].url
    });
  }

  return { duplicateGroups, replacements, deleteIds };
};

const printSummary = ({ duplicateGroups, deleteIds, apply, userId }) => {
  console.log('[DEDUP] Duplicate article cleanup');
  console.log(`[DEDUP] Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[DEDUP] Scope: ${userId ? `userId=${userId}` : 'all users'}`);
  console.log(`[DEDUP] Duplicate groups: ${duplicateGroups.length}`);
  console.log(`[DEDUP] Articles to delete: ${deleteIds.length}`);

  if (duplicateGroups.length > 0) {
    console.log('[DEDUP] Sample groups (up to 10):');
    duplicateGroups.slice(0, 10).forEach(group => {
      console.log(
        `  - ${group.groupKey} | keep=${group.keeperId} | delete=${group.deleteIds.join(',')} | url=${group.sampleUrl}`
      );
    });
  }
};

const cleanupDuplicates = async ({ apply, userId }) => {
  const where = {};
  if (userId) {
    where.userId = userId;
  }

  const [articles, clusters] = await Promise.all([
    Article.findAll({
      attributes: ['id', 'userId', 'url', 'starInd', 'clickedAmount', 'published', 'createdAt'],
      where,
      raw: true
    }),
    ArticleCluster.findAll({
      attributes: ['id', 'userId', 'representativeArticleId'],
      where: userId ? { userId } : undefined,
      raw: true
    })
  ]);

  const representativeIds = new Set(
    clusters.map(cluster => cluster.representativeArticleId).filter(Boolean)
  );

  const plan = buildPlan(articles, representativeIds);
  printSummary({ ...plan, apply, userId });

  if (!apply || plan.deleteIds.length === 0) {
    return;
  }

  await sequelize.transaction(async transaction => {
    // Repoint cluster representatives before deleting duplicate articles.
    for (const [duplicateId, keeperId] of plan.replacements.entries()) {
      await ArticleCluster.update(
        { representativeArticleId: keeperId },
        {
          where: { representativeArticleId: duplicateId },
          transaction
        }
      );
    }

    const idChunks = chunk(plan.deleteIds, CHUNK_SIZE);

    for (const ids of idChunks) {
      await Tag.destroy({
        where: { articleId: { [Op.in]: ids } },
        transaction
      });

      await Article.destroy({
        where: { id: { [Op.in]: ids } },
        transaction
      });
    }
  });

  console.log('[DEDUP] Cleanup complete.');
};

(async () => {
  try {
    const options = parseArgs();
    await cleanupDuplicates(options);
    process.exit(0);
  } catch (err) {
    console.error('[DEDUP] Cleanup failed:', err);
    process.exit(1);
  }
})();
