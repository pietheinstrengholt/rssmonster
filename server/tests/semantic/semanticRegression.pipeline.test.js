import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';

import db from '../../models/index.js';
import { repairRecentEventsForUser } from '../../services/reconcile/semanticPipelineScopes.js';
import { printSemanticArticleRankingTable } from '../helpers/semanticRegressionReport.js';
import {
  printSemanticRegressionTrace,
  refreshSemanticRegressionTrace,
  resetSemanticRegressionTrace
} from '../helpers/semanticRegressionTrace.js';

const {
  sequelize,
  User,
  Category,
  Feed,
  Article,
  Event,
  Topic,
  ArticleTopic,
  EventTopic,
  Island,
  IslandTopic
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression.json');
const VECTOR_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression.vectors.json');
const FIXTURE_USERNAME = 'semantic-regression-user';
const FIXTURE_PASSWORD = 'rssmonster';
const EXPECTED_MIN_EVENTS = 3;
const EXPECTED_MIN_ASSIGNED_ARTICLES = 3;

let semanticRegressionUserId = null;

// This function loads the baseline semantic fixture.
function loadFixture() {
  return readFile(FIXTURE_PATH, 'utf8').then(JSON.parse);
}

// This function loads the baseline semantic vector fixture.
async function loadVectorFixture() {
  try {
    return await readFile(VECTOR_FIXTURE_PATH, 'utf8').then(JSON.parse);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'Missing semantic vector fixture. Run `npm run fixture:semantic-vectors` in server/ before this regression test.'
      );
    }

    throw err;
  }
}

// This function checks whether the semantic regression vector fixtures are available.
async function hasVectorFixtures(paths) {
  for (const path of paths) {
    try {
      await readFile(path, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  return true;
}
const semanticRegressionDescribe = (await hasVectorFixtures([
  VECTOR_FIXTURE_PATH
])) ? describe : describe.skip;

// This function hashes article content using the same stable key as the vector fixtures.
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// This function maps content hashes to stored embedding vectors.
function buildVectorMap(vectorFixture) {
  return new Map(
    vectorFixture.articles.map(article => [
      article.contentSourceHash,
      {
        articleVector: article.articleVector,
        embeddingModel: article.embeddingModel || vectorFixture.embeddingModel
      }
    ])
  );
}

// This function derives a title when fixture rows do not include one.
function titleFromContent(content, articleIndex) {
  const firstSentence = content.split('.').find(Boolean)?.trim() || `Semantic fixture article ${articleIndex + 1}`;
  return firstSentence.slice(0, 180);
}

// This function picks the content field used by semantic vector fixtures.
function articleContent(fixtureArticle) {
  return (
    fixtureArticle.contentHtml ||
    fixtureArticle.contentOriginal ||
    fixtureArticle.content ||
    fixtureArticle.title ||
    ''
  ).trim();
}

// This function resolves the fixture article title.
function articleTitle(fixtureArticle, articleIndex) {
  return fixtureArticle.title || titleFromContent(articleContent(fixtureArticle), articleIndex);
}

// This function normalizes fixture dates into a recent testing window.
function buildFixturePublishedResolver(fixtureArticles, now = Date.now()) {
  const fixtureTimes = fixtureArticles
    .map(article => Date.parse(article.publishedAt))
    .filter(Number.isFinite);

  if (!fixtureTimes.length) {
    return (_fixtureArticle, fallbackPublished) => fallbackPublished;
  }

  const minFixtureTime = Math.min(...fixtureTimes);
  const maxFixtureTime = Math.max(...fixtureTimes);
  const fixtureSpanMs = Math.max(maxFixtureTime - minFixtureTime, 1);
  const normalizedWindowMs = 6 * 24 * 60 * 60 * 1000;
  const recentOffsetMs = 60 * 60 * 1000;

  return (fixtureArticle, fallbackPublished) => {
    const fixtureTime = Date.parse(fixtureArticle.publishedAt);
    if (!Number.isFinite(fixtureTime)) return fallbackPublished;

    const position = (fixtureTime - minFixtureTime) / fixtureSpanMs;
    return new Date(now - recentOffsetMs - (1 - position) * normalizedWindowMs);
  };
}

// This function deletes the existing semantic regression user and dependent fixture data.
async function deleteExistingFixtureUser() {
  const user = await User.findOne({ where: { username: FIXTURE_USERNAME } });
  if (!user) return;

  const [articleIds, eventIds, topicIds, islandIds] = await Promise.all([
    Article.findAll({ where: { userId: user.id }, attributes: ['id'], raw: true }),
    Event.findAll({ where: { userId: user.id }, attributes: ['id'], raw: true }),
    Topic.findAll({ where: { userId: user.id }, attributes: ['id'], raw: true }),
    Island.findAll({ where: { userId: user.id }, attributes: ['id'], raw: true })
  ]);

  const articleIdList = articleIds.map(row => row.id);
  const eventIdList = eventIds.map(row => row.id);
  const topicIdList = topicIds.map(row => row.id);
  const islandIdList = islandIds.map(row => row.id);

  if (islandIdList.length) {
    await IslandTopic.destroy({ where: { islandId: { [Op.in]: islandIdList } } });
  }

  if (eventIdList.length) {
    await EventTopic.destroy({ where: { eventId: { [Op.in]: eventIdList } } });
  }

  if (articleIdList.length) {
    await ArticleTopic.destroy({ where: { articleId: { [Op.in]: articleIdList } } });
  }

  if (topicIdList.length) {
    await ArticleTopic.destroy({ where: { topicId: { [Op.in]: topicIdList } } });
    await EventTopic.destroy({ where: { topicId: { [Op.in]: topicIdList } } });
  }

  await Island.destroy({ where: { userId: user.id } });
  await Article.destroy({ where: { userId: user.id } });
  await Event.destroy({ where: { userId: user.id } });
  await Topic.destroy({ where: { userId: user.id } });
  await Feed.destroy({ where: { userId: user.id } });
  await Category.destroy({ where: { userId: user.id } });

  await user.destroy();
}

// This function applies fixture vectors to the inserted baseline articles.
async function applyArticleVectors(userId, vectorByContentSourceHash) {
  const articles = await Article.findAll({
    where: { userId },
    attributes: ['id', 'contentSourceHash']
  });

  for (const article of articles) {
    const vectorRecord = vectorByContentSourceHash.get(article.contentSourceHash);

    if (!vectorRecord?.articleVector?.length) {
      throw new Error(`Missing semantic vector for inserted article ${article.id} (${article.contentSourceHash})`);
    }

    await article.update({
      articleVector: vectorRecord.articleVector,
      embedding_model: vectorRecord.embeddingModel
    });
  }

  return articles.length;
}

semanticRegressionDescribe('semantic regression fixture pipeline', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await deleteExistingFixtureUser();
  });

  afterAll(async () => {
    await printSemanticArticleRankingTable(semanticRegressionUserId, {
      includeIslands: false
    });
  });

  it('loads semantic fixture content and creates baseline events', async () => {
    const fixture = await loadFixture();
    const vectorFixture = await loadVectorFixture();
    const vectorByContentSourceHash = buildVectorMap(vectorFixture);

    expect(fixture.feeds.length).toBeGreaterThan(0);
    expect(fixture.articles.length).toBeGreaterThan(0);

    const missingVectorArticles = fixture.articles
      .map((article, index) => {
        const content = articleContent(article);

        return {
          index,
          contentSourceHash: hashContent(content),
          preview: content.slice(0, 160)
        };
      })
      .filter(article => !vectorByContentSourceHash.has(article.contentSourceHash));

    expect(
      missingVectorArticles,
      'semantic-regression.vectors.json is stale for semantic-regression.json. ' +
      'Run `npm run fixture:semantic-vectors` in server/ after exporting the fixture.\n' +
      JSON.stringify(missingVectorArticles, null, 2)
    ).toHaveLength(0);

    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
    const apiHash = crypto.createHash('md5')
      .update(`${FIXTURE_USERNAME}:${FIXTURE_PASSWORD}`)
      .digest('hex');

    const user = await User.create({
      username: FIXTURE_USERNAME,
      password: passwordHash,
      hash: apiHash,
      role: 'user'
    });
    semanticRegressionUserId = user.id;

    const categoryIdMap = new Map();
    const fixtureCategories = fixture.categories?.length
      ? fixture.categories
      : [{ id: 1, name: 'Semantic Regression', categoryOrder: 0 }];

    for (const fixtureCategory of fixtureCategories) {
      const category = await Category.create({
        userId: user.id,
        name: fixtureCategory.name || 'Semantic Regression',
        categoryOrder: fixtureCategory.categoryOrder || 0
      });

      categoryIdMap.set(fixtureCategory.id, category.id);
    }

    const fallbackCategoryId = categoryIdMap.values().next().value;

    const feedIdMap = new Map();
    for (const fixtureFeed of fixture.feeds) {
      const feed = await Feed.create({
        userId: user.id,
        categoryId: categoryIdMap.get(fixtureFeed.categoryId) || fallbackCategoryId,
        feedName: fixtureFeed.feedName,
        feedDesc: fixtureFeed.feedDesc || fixtureFeed.description,
        feedType: fixtureFeed.feedType || 'rss',
        url: fixtureFeed.url,
        status: fixtureFeed.status || 'active'
      });

      feedIdMap.set(fixtureFeed.id, feed.id);
    }

    const now = Date.now();
    const resolvePublished = buildFixturePublishedResolver(fixture.articles, now);
    const articles = fixture.articles.map((fixtureArticle, index) => {
      const content = articleContent(fixtureArticle);
      const contentSourceHash = hashContent(content);
      const fallbackPublished = new Date(now - (fixture.articles.length - index) * 5 * 60 * 1000);
      const publishedAt = resolvePublished(fixtureArticle, fallbackPublished);

      return {
        userId: user.id,
        feedId: feedIdMap.get(fixtureArticle.feedId),
        status: fixtureArticle.status,
        favoriteInd: fixtureArticle.favoriteInd,
        negativeInd: fixtureArticle.negativeInd,
        clickedAmount: fixtureArticle.clickedAmount,
        url: `https://fixtures.rssmonster.test/semantic/${index + 1}`,
        title: articleTitle(fixtureArticle, index),
        description: content.slice(0, 500),
        contentOriginal: fixtureArticle.contentOriginal || content,
        contentHtml: fixtureArticle.contentHtml || content,
        contentSourceHash,
        publishedAt,
        firstSeen: publishedAt
      };
    });

    await Article.bulkCreate(articles);
    const vectorizedArticleCount = await applyArticleVectors(user.id, vectorByContentSourceHash);

    expect(vectorizedArticleCount).toBe(fixture.articles.length);

    await repairRecentEventsForUser(user.id, { skipTopicAssignment: true });

    const [
      feedCount,
      articleCount,
      eventCount,
      assignedArticleCount
    ] = await Promise.all([
      Feed.count({ where: { userId: user.id } }),
      Article.count({ where: { userId: user.id } }),
      Event.count({ where: { userId: user.id } }),
      Article.count({ where: { userId: user.id, eventId: { [Op.ne]: null } } })
    ]);

    expect(feedCount).toBe(fixture.feeds.length);
    expect(articleCount).toBe(fixture.articles.length);
    expect(eventCount).toBeGreaterThanOrEqual(EXPECTED_MIN_EVENTS);
    expect(assignedArticleCount).toBeGreaterThanOrEqual(EXPECTED_MIN_ASSIGNED_ARTICLES);

    const baselineArticleIds = await Article.findAll({
      where: { userId: user.id },
      attributes: ['id'],
      raw: true
    }).then(rows => rows.map(row => Number(row.id)));

    await resetSemanticRegressionTrace({
      userId: user.id,
      baselineArticleIds
    });
    await refreshSemanticRegressionTrace({
      userId: user.id,
      phase: 'baseline-events'
    });
    await printSemanticRegressionTrace({
      userId: user.id,
      phase: 'baseline-events'
    });
  }, 60000);

});
