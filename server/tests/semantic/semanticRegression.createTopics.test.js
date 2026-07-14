import { afterAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { rebuildAllTopicsForUser } from '../../services/reconcile/semanticPipelineScopes.js';
import { printSemanticArticleRankingTableForUser } from '../helpers/semanticRegressionReport.js';
import {
  printSemanticRegressionTrace,
  refreshSemanticRegressionTrace
} from '../helpers/semanticRegressionTrace.js';

const {
  User,
  Article,
  Event,
  Topic,
  ArticleTopic,
  EventTopic
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTOR_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression.vectors.json');
const FIXTURE_USERNAME = 'semantic-regression-user';
const EXPECTED_MIN_TOPICS = 2;
const EXPECTED_MIN_TOPIC_LINKED_ARTICLES = 3;
const EXPECTED_MIN_ARTICLE_TOPIC_LINKS = 3;

// This function checks whether the semantic regression vector fixture is available.
async function hasVectorFixture() {
  try {
    await readFile(VECTOR_FIXTURE_PATH, 'utf8');
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

const semanticRegressionDescribe = (await hasVectorFixture()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression topic creation command', () => {
  afterAll(async () => {
    await printSemanticArticleRankingTableForUser(FIXTURE_USERNAME, {
      includeIslands: false
    });
  });

  it('creates topics after baseline events are created', async () => {
    const user = await User.findOne({
      where: { username: FIXTURE_USERNAME },
      attributes: ['id'],
      raw: true
    });

    expect(user, 'semantic regression baseline user should exist before topic creation').toBeTruthy();

    const baselineEventCount = await Event.count({ where: { userId: user.id } });

    expect(baselineEventCount).toBeGreaterThan(0);

    const topicResult = await rebuildAllTopicsForUser(user.id, {
      assignmentContext: 'full-rebuild'
    });
    const [
      topicCount,
      articleTopicLinkCount,
      eventTopicLinkCount,
      topicLinkedArticleCount
    ] = await Promise.all([
      Topic.count({ where: { userId: user.id } }),
      ArticleTopic.count({
        include: [{
          model: Article,
          required: true,
          attributes: [],
          where: { userId: user.id }
        }]
      }),
      EventTopic.count({
        include: [{
          model: Event,
          required: true,
          attributes: [],
          where: { userId: user.id }
        }]
      }),
      Article.count({ where: { userId: user.id, topicId: { [Op.ne]: null } } })
    ]);

    expect(topicResult.eventCount).toBe(baselineEventCount);
    expect(topicResult.topicCount).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPICS);
    expect(topicResult.touchedTopicIds.length).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPICS);
    expect(topicResult.stats.newTopicsCreated).toBeGreaterThan(0);
    expect(topicCount).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPICS);
    expect(topicLinkedArticleCount).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPIC_LINKED_ARTICLES);
    expect(articleTopicLinkCount).toBeGreaterThanOrEqual(EXPECTED_MIN_ARTICLE_TOPIC_LINKS);
    expect(eventTopicLinkCount).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPICS);

    await refreshSemanticRegressionTrace({
      userId: user.id,
      phase: 'baseline-topics'
    });
    await printSemanticRegressionTrace({
      userId: user.id,
      phase: 'baseline-topics'
    });
  }, 180000);
});
