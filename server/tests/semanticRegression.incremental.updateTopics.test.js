import { afterAll, describe, expect, it, beforeAll } from 'vitest';
import { Op } from 'sequelize';

import db from '../models/index.js';
import { rebuildAllTopicsForUser } from '../services/reconcile/semanticPipelineScopes.js';
import {
  EXPECTED_INCREMENTAL_ARTICLE_COUNT,
  FIXTURE_USERNAME,
  findIncrementalArticleIds,
  hasIncrementalVectorFixture,
  loadIncrementalFixture
} from './helpers/semanticRegressionIncremental.js';
import { printSemanticArticleRankingTable } from './helpers/semanticRegressionReport.js';
import {
  printSemanticRegressionTrace,
  refreshSemanticRegressionTrace
} from './helpers/semanticRegressionTrace.js';

const {
  sequelize,
  User,
  Article,
  Event,
  Topic,
  ArticleTopic,
  EventTopic
} = db;

let semanticRegressionUserId = null;
let incrementalArticleIdsForReport = [];

const semanticRegressionDescribe = (await hasIncrementalVectorFixture()) ? describe : describe.skip;

// This function prints topic reuse and creation counts for the incremental wave.
function printTopicReuseDebug(topicResult, counts) {
  console.table([{
    baselineTopicCount: counts.baselineTopicCount,
    finalTopicCount: counts.finalTopicCount,
    eventsProcessed: topicResult.eventCount,
    eventsMatched: topicResult.stats.eventsMatched,
    eventsUnmatched: topicResult.stats.eventsUnmatched,
    eventsSkipped: topicResult.stats.eventsSkipped,
    newTopicsCreated: topicResult.stats.newTopicsCreated,
    touchedTopics: topicResult.touchedTopicIds.length,
    topicLinkedIncrementalArticles: counts.topicLinkedIncrementalArticleCount,
    incrementalArticleTopicLinks: counts.incrementalArticleTopicLinkCount,
    incrementalEventTopicLinks: counts.incrementalEventTopicLinkCount
  }]);
}

semanticRegressionDescribe('semantic regression incremental topic update', () => {
  beforeAll(async () => {
    await sequelize.authenticate();

    const user = await User.findOne({ where: { username: FIXTURE_USERNAME } });

    expect(user, 'semantic regression user must exist before incremental topic update').toBeTruthy();
    semanticRegressionUserId = user.id;
  }, 60000);

  afterAll(async () => {
    await printSemanticArticleRankingTable(semanticRegressionUserId, {
      newArticleIds: incrementalArticleIdsForReport
    });
  });

  it('updates topics for incremental events and reports reuse versus new creation', async () => {
    const userId = semanticRegressionUserId;
    const incrementalFixture = await loadIncrementalFixture();
    const incrementalArticleIds = await findIncrementalArticleIds(userId, incrementalFixture);
    incrementalArticleIdsForReport = incrementalArticleIds;
    const baselineTopicCount = await Topic.count({ where: { userId } });

    expect(incrementalArticleIds).toHaveLength(EXPECTED_INCREMENTAL_ARTICLE_COUNT);
    expect(baselineTopicCount).toBeGreaterThan(0);

    const topicResult = await rebuildAllTopicsForUser(userId, {
      assignmentContext: 'incremental'
    });
    const [
      finalTopicCount,
      topicLinkedIncrementalArticleCount,
      incrementalArticleTopicLinkCount,
      incrementalEventTopicLinkCount
    ] = await Promise.all([
      Topic.count({ where: { userId } }),
      Article.count({
        where: {
          id: { [Op.in]: incrementalArticleIds },
          topicId: { [Op.ne]: null }
        }
      }),
      ArticleTopic.count({
        where: {
          articleId: { [Op.in]: incrementalArticleIds }
        }
      }),
      EventTopic.count({
        include: [{
          model: Event,
          required: true,
          attributes: [],
          where: { userId }
        }]
      })
    ]);

    printTopicReuseDebug(topicResult, {
      baselineTopicCount,
      finalTopicCount,
      topicLinkedIncrementalArticleCount,
      incrementalArticleTopicLinkCount,
      incrementalEventTopicLinkCount
    });

    expect(topicResult.eventCount).toBeGreaterThan(0);
    expect(topicResult.stats.eventsMatched).toBeGreaterThan(0);
    expect(topicResult.stats.newTopicsCreated).toBeGreaterThanOrEqual(0);
    expect(finalTopicCount).toBeGreaterThanOrEqual(baselineTopicCount);
    expect(topicLinkedIncrementalArticleCount).toBeGreaterThan(0);
    expect(incrementalArticleTopicLinkCount).toBeGreaterThan(0);
    expect(incrementalEventTopicLinkCount).toBeGreaterThan(0);

    await refreshSemanticRegressionTrace({
      userId,
      phase: 'incremental-topics',
      incrementalArticleIds
    });
    await printSemanticRegressionTrace({
      userId,
      phase: 'incremental-topics'
    });
  }, 180000);
});
