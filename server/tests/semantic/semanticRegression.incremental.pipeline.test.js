import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { runIncrementalEventsForUser } from '../../services/reconcile/semanticPipelineScopes.js';
import {
  EXPECTED_INCREMENTAL_ARTICLE_COUNT,
  FIXTURE_USERNAME,
  buildVectorMap,
  findIncrementalArticleIds,
  hasIncrementalVectorFixture,
  insertMissingFixtureArticles,
  loadIncrementalFixture,
  loadIncrementalVectorFixture
} from '../helpers/semanticRegressionIncremental.js';
import { printSemanticArticleRankingTable } from '../helpers/semanticRegressionReport.js';
import {
  markSemanticRegressionArticles,
  printSemanticRegressionTrace,
  refreshSemanticRegressionTrace
} from '../helpers/semanticRegressionTrace.js';

const {
  sequelize,
  User,
  Article,
  Event
} = db;

const MIN_STRONG_EVENT_STRENGTH = 0.35;

let semanticRegressionUserId = null;
let incrementalArticleIdsForReport = [];

const semanticRegressionDescribe = (await hasIncrementalVectorFixture()) ? describe : describe.skip;

// This function shortens event names for compact debug tables.
function compactEventName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

// This function prints event reuse for the incremental article wave.
async function printIncrementalEventReuseDebug(userId, incrementalArticleIds, baselineEventIds) {
  const articles = await Article.findAll({
    where: {
      id: { [Op.in]: incrementalArticleIds }
    },
    include: [{
      model: Event,
      as: 'event',
      required: false,
      attributes: ['id', 'name', 'articleCount', 'sourceCount', 'eventStrength', 'status']
    }],
    attributes: ['id', 'title', 'eventId'],
    order: [
      ['eventId', 'ASC'],
      ['id', 'ASC']
    ]
  });
  const baselineEventIdSet = new Set(baselineEventIds.map(Number));
  const rowsByEventId = new Map();

  for (const article of articles) {
    const event = article.event;
    const eventId = Number(article.eventId || 0);
    const row = rowsByEventId.get(eventId) || {
      eventId: eventId || '-',
      reused: eventId && baselineEventIdSet.has(eventId) ? 'yes' : 'no',
      eventName: compactEventName(event?.name) || '-',
      articles: 0,
      eventArticles: Number(event?.articleCount || 0),
      sourceCount: Number(event?.sourceCount || 0),
      strength: Number(Number(event?.eventStrength || 0).toFixed(4)),
      sampleTitle: article.title || '-'
    };

    row.articles += 1;
    rowsByEventId.set(eventId, row);
  }

  const rows = [...rowsByEventId.values()]
    .sort((left, right) => (
      String(right.reused).localeCompare(String(left.reused)) ||
      Number(right.articles || 0) - Number(left.articles || 0) ||
      Number(left.eventId || 0) - Number(right.eventId || 0)
    ));

  console.table(rows);

  return rows;
}

semanticRegressionDescribe('semantic regression incremental event pipeline', () => {
  beforeAll(async () => {
    await sequelize.authenticate();

    const user = await User.findOne({ where: { username: FIXTURE_USERNAME } });

    expect(user, 'semantic regression user must exist before incremental event pass').toBeTruthy();
    semanticRegressionUserId = user.id;
  }, 60000);

  afterAll(async () => {
    await printSemanticArticleRankingTable(semanticRegressionUserId, {
      newArticleIds: incrementalArticleIdsForReport
    });
  });

  it('loads incremental fixture content and assigns only events', async () => {
    const userId = semanticRegressionUserId;
    const incrementalFixture = await loadIncrementalFixture();
    const incrementalVectorFixture = await loadIncrementalVectorFixture();
    const incrementalVectorByContentHash = buildVectorMap(incrementalVectorFixture);

    expect(incrementalFixture.articles).toHaveLength(EXPECTED_INCREMENTAL_ARTICLE_COUNT);

    const baselineArticleCount = await Article.count({ where: { userId } });
    const baselineEventRows = await Event.findAll({
      where: { userId },
      attributes: ['id'],
      raw: true
    });
    const baselineEventIds = baselineEventRows.map(row => Number(row.id));
    const baselineEventCount = baselineEventIds.length;
    const baselineAssignments = await Article.findAll({
      where: { userId },
      attributes: ['id', 'eventId'],
      raw: true
    });
    const baselineEventIdByArticleId = new Map(
      baselineAssignments.map(article => [Number(article.id), article.eventId])
    );
    const incrementalInsertedAfter = new Date(Date.now() - 1000);
    const insertedCount = await insertMissingFixtureArticles(
      userId,
      incrementalFixture,
      incrementalVectorByContentHash,
      'https://fixtures.rssmonster.test/semantic-incremental'
    );
    const incrementalArticleIds = await findIncrementalArticleIds(userId, incrementalFixture);
    incrementalArticleIdsForReport = incrementalArticleIds;

    expect(insertedCount).toBeGreaterThan(0);
    expect(insertedCount).toBeLessThanOrEqual(EXPECTED_INCREMENTAL_ARTICLE_COUNT);
    expect(incrementalArticleIds).toHaveLength(EXPECTED_INCREMENTAL_ARTICLE_COUNT);

    const preClusteredIncrementalCount = await Article.count({
      where: {
        id: { [Op.in]: incrementalArticleIds },
        eventId: { [Op.ne]: null }
      }
    });

    expect(preClusteredIncrementalCount).toBe(0);

    const eventResult = await runIncrementalEventsForUser(userId, {
      createdAfter: incrementalInsertedAfter,
      skipTopicAssignment: true
    });
    const [
      finalArticleCount,
      finalEventCount,
      assignedIncrementalArticleCount,
      preservedBaselineAssignments
    ] = await Promise.all([
      Article.count({ where: { userId } }),
      Event.count({ where: { userId } }),
      Article.count({
        where: {
          id: { [Op.in]: incrementalArticleIds },
          eventId: { [Op.ne]: null }
        }
      }),
      Article.findAll({
        where: {
          id: { [Op.in]: [...baselineEventIdByArticleId.keys()] }
        },
        attributes: ['id', 'eventId'],
        raw: true
      })
    ]);
    const incrementalEventIds = [
      ...new Set(
        await Article.findAll({
          where: {
            id: { [Op.in]: incrementalArticleIds },
            eventId: { [Op.ne]: null }
          },
          attributes: ['eventId'],
          raw: true
        }).then(rows => rows.map(row => Number(row.eventId)).filter(Boolean))
      )
    ];
    const incrementalEvents = await Event.findAll({
      where: {
        id: { [Op.in]: incrementalEventIds }
      },
      attributes: ['id', 'articleCount', 'sourceCount', 'eventStrength', 'status'],
      raw: true
    });
    const reuseRows = await printIncrementalEventReuseDebug(userId, incrementalArticleIds, baselineEventIds);

    expect(finalArticleCount).toBe(baselineArticleCount + insertedCount);
    expect(finalEventCount).toBeGreaterThanOrEqual(baselineEventCount);
    expect(eventResult.topicAssignment.skipped).toBe(true);
    expect(eventResult.articleCount).toBe(insertedCount);
    expect(preservedBaselineAssignments).toHaveLength(baselineEventIdByArticleId.size);

    for (const article of preservedBaselineAssignments) {
      expect(article.eventId).toBe(baselineEventIdByArticleId.get(Number(article.id)));
    }

    expect(assignedIncrementalArticleCount).toBeGreaterThan(0);
    expect(incrementalEvents.length).toBeGreaterThan(0);
    expect(reuseRows.length).toBeGreaterThan(0);

    for (const event of incrementalEvents) {
      expect(Number(event.articleCount || 0)).toBeGreaterThan(0);
      expect(Number(event.sourceCount || 0)).toBeGreaterThan(0);
      expect(event.status).toBeTruthy();
      expect(Number(event.eventStrength || 0)).toBeGreaterThanOrEqual(MIN_STRONG_EVENT_STRENGTH);
    }

    await markSemanticRegressionArticles({
      userId,
      incrementalArticleIds
    });
    await refreshSemanticRegressionTrace({
      userId,
      phase: 'incremental-events',
      incrementalArticleIds
    });
    await printSemanticRegressionTrace({
      userId,
      phase: 'incremental-events'
    });
  }, 180000);
});
