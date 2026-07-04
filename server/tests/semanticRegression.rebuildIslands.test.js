import { describe, expect, it } from 'vitest';

import db from '../models/index.js';
import { cosineSimilarity, parseVector } from '../services/vectors/index.js';
import {
  FIXTURE_USERNAME,
  expectSemanticRegressionIslandsBuilt,
  hasTaxonomyVectorFixture
} from './helpers/semanticRegressionIslands.js';

const { User, Island, IslandTopic } = db;
const NEAR_DUPLICATE_ISLAND_SIMILARITY = 0.92;
const semanticRegressionDescribe = (await hasTaxonomyVectorFixture()) ? describe : describe.skip;

// This function normalizes island names for duplicate-name diagnostics.
function normalizeIslandName(name = '') {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function groups islands by their normalized display name.
function groupIslandsByNormalizedName(islands = []) {
  const groups = new Map();

  for (const island of islands) {
    const normalizedName = normalizeIslandName(island.label);
    if (!normalizedName) continue;

    const group = groups.get(normalizedName) || [];
    group.push(island);
    groups.set(normalizedName, group);
  }

  return groups;
}

// This function returns the latest audited source article count for one island.
function sourceArticleCountForIsland(island) {
  const audit = Array.isArray(island.populationAudit) ? island.populationAudit : [];
  const latest = audit[audit.length - 1] || null;
  const relatedCount = latest?.metrics?.relatedArticleCount;
  if (Number.isFinite(Number(relatedCount))) return Number(relatedCount);

  const sourceArticles = latest?.sourceArticles?.articles;
  if (Array.isArray(sourceArticles)) return sourceArticles.length;

  return null;
}

// This function formats one duplicate island row for console.table diagnostics.
function duplicateDiagnosticRow(normalizedName, island, firstIsland, topicCountByIslandId) {
  const vector = parseVector(island.islandVector) || [];
  const firstVector = parseVector(firstIsland?.islandVector) || [];
  const similarity = island.id === firstIsland?.id
    ? 1
    : cosineSimilarity(vector, firstVector, { coerceNumbers: true });

  return {
    normalizedName,
    islandId: Number(island.id),
    displayName: island.label,
    status: island.archivedInd ? 'archived' : 'active',
    sourceArticleCount: sourceArticleCountForIsland(island),
    articleCount: sourceArticleCountForIsland(island),
    topicCount: topicCountByIslandId.get(Number(island.id)) || 0,
    vectorDim: vector.length,
    simToFirst: Number(similarity.toFixed(4)),
    createdAt: island.createdAt?.toISOString?.() || String(island.createdAt || ''),
    updatedAt: island.updatedAt?.toISOString?.() || String(island.updatedAt || '')
  };
}

// This function prints compact duplicate-name diagnostics for active islands.
function printIslandDuplicateDiagnostics(groups, topicCountByIslandId, summary) {
  console.table([summary]);

  for (const [normalizedName, islands] of groups.entries()) {
    if (islands.length <= 1) continue;

    console.table(
      islands.map(island =>
        duplicateDiagnosticRow(normalizedName, island, islands[0], topicCountByIslandId)
      )
    );
  }
}

// This function asserts same-name islands are not near-duplicate vectors.
function assertNoNearDuplicateIslandNames(groups) {
  const nearDuplicates = [];

  for (const [normalizedName, islands] of groups.entries()) {
    if (islands.length <= 1) continue;

    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const leftVector = parseVector(islands[i].islandVector) || [];
        const rightVector = parseVector(islands[j].islandVector) || [];
        const similarity = cosineSimilarity(leftVector, rightVector, { coerceNumbers: true });

        if (similarity >= NEAR_DUPLICATE_ISLAND_SIMILARITY) {
          nearDuplicates.push({
            normalizedName,
            islandIds: `${islands[i].id},${islands[j].id}`,
            similarity: Number(similarity.toFixed(4))
          });
        }
      }
    }
  }

  expect(nearDuplicates).toEqual([]);
}

// This function loads active island rows and topic counts for the semantic regression user.
async function loadActiveIslandDiagnostics() {
  const user = await User.findOne({
    where: { username: FIXTURE_USERNAME },
    attributes: ['id'],
    raw: true
  });

  expect(user, 'semantic regression user should exist before island duplicate diagnostics').toBeTruthy();

  const islands = await Island.findAll({
    where: {
      userId: user.id,
      archivedInd: false
    },
    order: [['label', 'ASC'], ['id', 'ASC']]
  });
  const islandIds = islands.map(island => Number(island.id));
  const topicRows = islandIds.length
    ? await IslandTopic.findAll({
      where: { islandId: islandIds },
      attributes: [
        'islandId',
        [db.sequelize.fn('COUNT', db.sequelize.col('topicId')), 'topicCount']
      ],
      group: ['islandId'],
      raw: true
    })
    : [];

  return {
    islands,
    topicCountByIslandId: new Map(
      topicRows.map(row => [Number(row.islandId), Number(row.topicCount || 0)])
    )
  };
}

semanticRegressionDescribe('semantic regression island rebuild command', () => {
  it('refreshes interest islands when the island build runs again after recluster', async () => {
    await expectSemanticRegressionIslandsBuilt(expect);

    const { islands, topicCountByIslandId } = await loadActiveIslandDiagnostics();
    const groups = groupIslandsByNormalizedName(islands);
    const duplicateGroups = [...groups.values()].filter(group => group.length > 1);
    const duplicateIslandCount = duplicateGroups.reduce((sum, group) => sum + group.length, 0);

    printIslandDuplicateDiagnostics(groups, topicCountByIslandId, {
      totalActiveIslands: islands.length,
      uniqueNormalizedNames: groups.size,
      duplicateNameGroups: duplicateGroups.length,
      duplicateIslandCount
    });

    assertNoNearDuplicateIslandNames(groups);
  }, 180000);
});
