import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { markDuplicateArticlesForUser } from '../../services/duplicates/articleDuplicates.js';
import { runIncrementalEventsForUser } from '../../services/reconcile/semanticPipelineScopes.js';
import { printSemanticArticleRankingTable } from '../helpers/semanticRegressionReport.js';

const {
  sequelize,
  User,
  Category,
  Feed,
  Article,
  Event
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const INCREMENTAL_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression-incremental.json');
const INCREMENTAL_VECTOR_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression-incremental.vectors.json');
const UNREAD_VECTOR_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression-incremental.unread.vectors.json');
const FIXTURE_USERNAME = 'semantic-regression-ad-event-user';
const FIXTURE_PASSWORD = 'rssmonster';
const TARGET_FEED_SOURCE_ID = 96;
const TARGET_ARTICLE_SOURCE_IDS = [771, 772, 773];
const TEST_DATABASE_NAME = 'rssmonstertest';
const AD_DUPLICATE_TEST_THRESHOLD = 0.985;

let semanticRegressionUserId = null;

// This function loads a JSON fixture from disk.
async function loadFixture(path) {
  const fixtureText = await readFile(path, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

// This function checks whether the unread vector fixture is available before enabling this focused test.
async function hasUnreadVectorFixture() {
  try {
    await readFile(UNREAD_VECTOR_FIXTURE_PATH, 'utf8');
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

const semanticRegressionDescribe = (await hasUnreadVectorFixture()) ? describe : describe.skip;

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

// This function resets only the dedicated regression user records.
async function clearFixtureUserContent(userId) {
  await Article.destroy({ where: { userId } });
  await Event.destroy({ where: { userId } });
  await Feed.destroy({ where: { userId } });
  await Category.destroy({ where: { userId } });
}

// This function creates the isolated regression user used by the focused AD cluster test.
async function findOrCreateRegressionUser() {
  const existingUser = await User.findOne({ where: { username: FIXTURE_USERNAME } });
  if (existingUser) return existingUser;

  const apiHash = crypto.createHash('md5')
    .update(`${FIXTURE_USERNAME}:${FIXTURE_PASSWORD}`)
    .digest('hex');

  return User.create({
    username: FIXTURE_USERNAME,
    password: FIXTURE_PASSWORD,
    hash: apiHash,
    role: 'user'
  });
}

// This function inserts the AD feed and its three near-duplicate heatwave articles.
async function seedAdHeatwaveArticles(userId) {
  const fixture = await loadFixture(INCREMENTAL_FIXTURE_PATH);
  const vectorFixture = await loadFixture(INCREMENTAL_VECTOR_FIXTURE_PATH);
  const vectorByContentSourceHash = buildVectorMap(vectorFixture);
  const feedFixture = fixture.feeds.find(feed => feed.sourceId === TARGET_FEED_SOURCE_ID);
  const articleFixtures = fixture.articles.filter(article =>
    TARGET_ARTICLE_SOURCE_IDS.includes(article.sourceId)
  );

  expect(feedFixture, 'AD feed fixture must exist').toBeTruthy();
  expect(articleFixtures).toHaveLength(TARGET_ARTICLE_SOURCE_IDS.length);

  const category = await Category.create({
    userId,
    name: 'News',
    categoryOrder: 0
  });
  const feed = await Feed.create({
    userId,
    categoryId: category.id,
    feedName: feedFixture.feedName,
    feedDesc: feedFixture.feedDesc || feedFixture.description,
    feedType: feedFixture.feedType || 'rss',
    url: feedFixture.url,
    status: feedFixture.status || 'active'
  });
  const insertedArticles = [];
  const basePublishedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

  for (const [index, fixtureArticle] of articleFixtures.entries()) {
    const content = articleContent(fixtureArticle);
    const contentSourceHash = hashContent(content);
    const vectorRecord = vectorByContentSourceHash.get(contentSourceHash);

    expect(vectorRecord?.articleVector?.length, `missing vector for ${fixtureArticle.sourceId}`)
      .toBeGreaterThan(0);

    const published = new Date(basePublishedAt.getTime() + index * 3 * 60 * 1000);

    insertedArticles.push(await Article.create({
      userId,
      feedId: feed.id,
      status: 'unread',
      favoriteInd: fixtureArticle.favoriteInd || 0,
      negativeInd: fixtureArticle.negativeInd || 0,
      clickedAmount: fixtureArticle.clickedAmount || 0,
      url: fixtureArticle.url,
      title: fixtureArticle.title,
      description: fixtureArticle.description || content.slice(0, 500),
      contentOriginal: fixtureArticle.contentOriginal || content,
      contentHtml: fixtureArticle.contentHtml || content,
      contentSourceHash,
      articleVector: vectorRecord.articleVector,
      embedding_model: vectorRecord.embeddingModel,
      published,
      firstSeen: published
    }));
  }

  return insertedArticles;
}

semanticRegressionDescribe('semantic regression AD heatwave semantic processing', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    expect(sequelize.getDatabaseName()).toBe(TEST_DATABASE_NAME);

    const user = await findOrCreateRegressionUser();
    semanticRegressionUserId = user.id;
  }, 60000);

  afterAll(async () => {
    await printSemanticArticleRankingTable(semanticRegressionUserId);
  });

  it('marks two AD heatwave article variants as duplicates of one canonical article', async () => {
    const userId = semanticRegressionUserId;

    await clearFixtureUserContent(userId);
    const insertedArticles = await seedAdHeatwaveArticles(userId);
    const insertedArticleIds = insertedArticles.map(article => article.id);

    const duplicateResult = await markDuplicateArticlesForUser(userId, {
      threshold: AD_DUPLICATE_TEST_THRESHOLD
    });
    await runIncrementalEventsForUser(userId, { skipTopicAssignment: true });

    const articles = await Article.findAll({
      where: {
        id: { [Op.in]: insertedArticleIds }
      },
      attributes: ['id', 'eventId', 'title', 'status', 'duplicateOfArticleId', 'duplicateCount'],
      order: [['id', 'ASC']],
      raw: true
    });

    expect(duplicateResult.duplicateCount).toBe(2);
    expect(articles).toHaveLength(TARGET_ARTICLE_SOURCE_IDS.length);

    const canonicalArticles = articles.filter(article => article.duplicateOfArticleId === null);
    const duplicateArticles = articles.filter(article => article.duplicateOfArticleId !== null);

    expect(canonicalArticles).toHaveLength(1);
    expect(duplicateArticles).toHaveLength(2);

    const [canonicalArticle] = canonicalArticles;
    expect(canonicalArticle.status).toBe('unread');
    expect(canonicalArticle.eventId).toBeNull();
    expect(canonicalArticle.duplicateCount).toBe(2);

    for (const duplicateArticle of duplicateArticles) {
      expect(duplicateArticle.status).toBe('duplicate');
      expect(duplicateArticle.duplicateOfArticleId).toBe(canonicalArticle.id);
      expect(duplicateArticle.eventId).toBeNull();
    }

    const eventCount = await Event.count({ where: { userId } });
    expect(eventCount).toBe(0);
  }, 60000);
});


