import { afterAll, describe, expect, it, beforeAll } from 'vitest';
import { Op } from 'sequelize';

import db from '../models/index.js';
import scoreArticlesFromIslandsForUser from '../services/score/scoreArticlesFromIslands.js';
import {
  FIXTURE_USERNAME,
  runSemanticRegressionIslandBuild,
  hasTaxonomyVectorFixture
} from './helpers/semanticRegressionIslands.js';
import {
  findIncrementalArticleIds,
  hasIncrementalVectorFixture,
  loadIncrementalFixture
} from './helpers/semanticRegressionIncremental.js';
import { printSemanticArticleRankingTable } from './helpers/semanticRegressionReport.js';

const {
  sequelize,
  User,
  Article,
  Island,
  IslandTopic
} = db;

let semanticRegressionUserId = null;
let incrementalArticleIdsForReport = [];

const semanticRegressionDescribe = (
  await hasTaxonomyVectorFixture() &&
  await hasIncrementalVectorFixture()
) ? describe : describe.skip;

// This function loads a compact island stability snapshot.
async function loadIslandSnapshot(userId) {
  const [islands, islandTopicLinkCount, scoredArticleCount] = await Promise.all([
    Island.findAll({
      where: { userId, archivedInd: false },
      attributes: ['id', 'label', 'weight'],
      order: [
        ['weight', 'DESC'],
        ['id', 'ASC']
      ],
      raw: true
    }),
    IslandTopic.count({
      include: [{
        model: Island,
        required: true,
        attributes: [],
        where: { userId, archivedInd: false }
      }]
    }),
    Article.count({
      where: {
        userId,
        interestScore: { [Op.ne]: 0 }
      }
    })
  ]);

  return {
    islands,
    islandIds: new Set(islands.map(island => Number(island.id))),
    islandCount: islands.length,
    islandTopicLinkCount,
    scoredArticleCount
  };
}

// This function prints island stability and enrichment counts.
function printIslandStabilityDebug(beforeSnapshot, afterSnapshot, islandResult, scoringResult) {
  const persistence = islandResult.persistenceSummary || {};
  const retainedIslandCount = afterSnapshot.islands
    .filter(island => beforeSnapshot.islandIds.has(Number(island.id)))
    .length;

  console.table([{
    beforeIslands: beforeSnapshot.islandCount,
    afterIslands: afterSnapshot.islandCount,
    retainedIslands: retainedIslandCount,
    existingIslandCount: persistence.existingIslandCount || 0,
    createdIslandCount: persistence.createdIslandCount || 0,
    updatedIslandCount: persistence.updatedIslandCount || 0,
    archivedIslandCount: persistence.archivedIslandCount || 0,
    beforeTopicLinks: beforeSnapshot.islandTopicLinkCount,
    afterTopicLinks: afterSnapshot.islandTopicLinkCount,
    scoredBefore: beforeSnapshot.scoredArticleCount,
    scoredAfter: afterSnapshot.scoredArticleCount,
    rescoredArticleCount: scoringResult.updatedCount || 0
  }]);

  return retainedIslandCount;
}

semanticRegressionDescribe('semantic regression incremental island update', () => {
  beforeAll(async () => {
    await sequelize.authenticate();

    const user = await User.findOne({ where: { username: FIXTURE_USERNAME } });

    expect(user, 'semantic regression user must exist before incremental island update').toBeTruthy();
    semanticRegressionUserId = user.id;
    incrementalArticleIdsForReport = await findIncrementalArticleIds(user.id, await loadIncrementalFixture());
  }, 60000);

  afterAll(async () => {
    await printSemanticArticleRankingTable(semanticRegressionUserId, {
      newArticleIds: incrementalArticleIdsForReport
    });
  });

  it('updates islands without recreating the existing island set unnecessarily', async () => {
    const userId = semanticRegressionUserId;
    const beforeSnapshot = await loadIslandSnapshot(userId);

    expect(beforeSnapshot.islandCount).toBeGreaterThan(0);
    expect(beforeSnapshot.islandTopicLinkCount).toBeGreaterThan(0);

    const { islandResult } = await runSemanticRegressionIslandBuild();
    const scoringResult = await scoreArticlesFromIslandsForUser(userId);
    const afterSnapshot = await loadIslandSnapshot(userId);
    const persistence = islandResult.persistenceSummary || {};
    const retainedIslandCount = printIslandStabilityDebug(
      beforeSnapshot,
      afterSnapshot,
      islandResult,
      scoringResult
    );

    expect(persistence.existingIslandCount).toBeGreaterThanOrEqual(beforeSnapshot.islandCount);
    expect(persistence.updatedIslandCount).toBeGreaterThan(0);
    expect(persistence.createdIslandCount).toBeLessThan(beforeSnapshot.islandCount);
    expect(persistence.archivedIslandCount || 0).toBe(0);
    expect(retainedIslandCount).toBeGreaterThan(0);
    expect(afterSnapshot.islandTopicLinkCount).toBeGreaterThanOrEqual(beforeSnapshot.islandTopicLinkCount);
    expect(afterSnapshot.scoredArticleCount).toBeGreaterThanOrEqual(beforeSnapshot.scoredArticleCount);
    expect(scoringResult.updatedCount).toBeGreaterThan(0);
  }, 180000);
});
