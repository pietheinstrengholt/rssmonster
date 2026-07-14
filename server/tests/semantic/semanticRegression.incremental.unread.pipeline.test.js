import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { runIncrementalEventsForUser } from '../../services/reconcile/semanticPipelineScopes.js';
import scoreArticlesFromIslandsForUser from '../../services/score/scoreArticlesFromIslands.js';
import { cosineSimilarity } from '../../services/vectors/index.js';
import { computeRecommended, computeRecommendedBreakdown } from '../../services/recommendations/recommendedScore.js';
import { printSemanticArticleRankingTable } from '../helpers/semanticRegressionReport.js';
import {
  markSemanticRegressionArticles,
  printSemanticRegressionTrace,
  refreshSemanticRegressionTrace
} from '../helpers/semanticRegressionTrace.js';

const {
  sequelize,
  User,
  Category,
  Feed,
  Article,
  Event,
  Island,
  IslandTopic,
  Tag
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const INCREMENTAL_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression-incremental.unread.json');
const INCREMENTAL_VECTOR_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression-incremental.unread.vectors.json');
const FIXTURE_USERNAME = 'semantic-regression-user';
const TEST_DATABASE_NAME = 'rssmonstertest';
const TAKE_TWO_ARTICLE_IDS_TO_MARK_READ = [652, 576];
const DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_ARTICLE_SCORE_THRESHOLD || '0.62'
);
let semanticRegressionUserId = null;
let insertedArticleIdsForReport = [];

// This function loads a JSON fixture from disk.
async function loadFixture(path) {
  const fixtureText = await readFile(path, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

// This function checks whether the incremental unread vector fixture is available.
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
  INCREMENTAL_VECTOR_FIXTURE_PATH
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

// This function derives a title when fixture rows do not include one.
function articleTitle(fixtureArticle, articleIndex) {
  if (fixtureArticle.title) return fixtureArticle.title;

  const firstSentence = articleContent(fixtureArticle)
    .split('.')
    .find(Boolean)
    ?.trim();

  return firstSentence?.slice(0, 180) || `Semantic incremental unread fixture article ${articleIndex + 1}`;
}

// This function parses fixture dates with a deterministic recent fallback.
function buildFixturePublishedResolver(fixtureArticles, now = Date.now()) {
  const fixtureTimes = fixtureArticles
    .map(article => Date.parse(article.published))
    .filter(Number.isFinite);

  if (!fixtureTimes.length) {
    return (_fixtureArticle, fallbackPublished) => fallbackPublished;
  }

  const minFixtureTime = Math.min(...fixtureTimes);
  const maxFixtureTime = Math.max(...fixtureTimes);
  const fixtureSpanMs = Math.max(maxFixtureTime - minFixtureTime, 1);
  const normalizedWindowMs = 6 * 24 * 60 * 60 * 1000;
  const recentOffsetMs = 30 * 60 * 1000;

  return (fixtureArticle, fallbackPublished) => {
    const fixtureTime = Date.parse(fixtureArticle.published);
    if (!Number.isFinite(fixtureTime)) return fallbackPublished;

    const position = (fixtureTime - minFixtureTime) / fixtureSpanMs;
    return new Date(now - recentOffsetMs - (1 - position) * normalizedWindowMs);
  };
}

// This function creates categories and returns fixture category IDs mapped to database IDs.
async function ensureFixtureCategories(userId, fixtureCategories) {
  const categoryIdMap = new Map();
  const categories = fixtureCategories?.length
    ? fixtureCategories
    : [{ id: 1, name: 'Semantic Regression', categoryOrder: 0 }];

  for (const fixtureCategory of categories) {
    const [category] = await Category.findOrCreate({
      where: {
        userId,
        name: fixtureCategory.name || 'Semantic Regression'
      },
      defaults: {
        categoryOrder: fixtureCategory.categoryOrder || 0
      }
    });

    categoryIdMap.set(fixtureCategory.id, category.id);
  }

  return categoryIdMap;
}

// This function creates feeds and returns fixture feed IDs mapped to database IDs.
async function ensureFixtureFeeds(userId, fixtureFeeds, categoryIdMap) {
  const feedIdMap = new Map();
  const fallbackCategoryId = categoryIdMap.values().next().value;

  for (const fixtureFeed of fixtureFeeds) {
    const [feed] = await Feed.findOrCreate({
      where: {
        userId,
        url: fixtureFeed.url
      },
      defaults: {
        categoryId: categoryIdMap.get(fixtureFeed.categoryId) || fallbackCategoryId,
        feedName: fixtureFeed.feedName,
        feedDesc: fixtureFeed.feedDesc || fixtureFeed.description,
        feedType: fixtureFeed.feedType || 'rss',
        status: fixtureFeed.status || 'active'
      }
    });

    feedIdMap.set(fixtureFeed.id, feed.id);
  }

  return feedIdMap;
}

// This function inserts fixture articles that are not already present by content hash.
async function insertMissingFixtureArticles(userId, fixture, vectorByContentSourceHash, urlPrefix) {
  const categoryIdMap = await ensureFixtureCategories(userId, fixture.categories);
  const feedIdMap = await ensureFixtureFeeds(userId, fixture.feeds, categoryIdMap);
  const now = Date.now();
  const resolvePublished = buildFixturePublishedResolver(fixture.articles, now);
  const insertedArticleIds = [];

  for (const [index, fixtureArticle] of fixture.articles.entries()) {
    const content = articleContent(fixtureArticle);
    const contentSourceHash = hashContent(content);
    const existingArticle = await Article.findOne({
      where: {
        userId,
        contentSourceHash
      },
      attributes: ['id']
    });

    if (existingArticle) {
      insertedArticleIds.push(existingArticle.id);
      continue;
    }

    const vectorRecord = vectorByContentSourceHash.get(contentSourceHash);
    if (!vectorRecord?.articleVector?.length) {
      throw new Error(`Missing semantic vector for fixture article ${contentSourceHash}`);
    }

    const fallbackPublished = new Date(now - (fixture.articles.length - index) * 5 * 60 * 1000);
    const published = resolvePublished(fixtureArticle, fallbackPublished);
    const article = await Article.create({
      userId,
      feedId: feedIdMap.get(fixtureArticle.feedId),
      status: fixtureArticle.status || 'unread',
      favoriteInd: fixtureArticle.favoriteInd || 0,
      negativeInd: fixtureArticle.negativeInd || 0,
      clickedAmount: fixtureArticle.clickedAmount || 0,
      url: fixtureArticle.url || `${urlPrefix}/${index + 1}`,
      title: articleTitle(fixtureArticle, index),
      description: fixtureArticle.description || content.slice(0, 500),
      contentOriginal: fixtureArticle.contentOriginal || content,
      contentHtml: fixtureArticle.contentHtml || content,
      contentSourceHash,
      articleVector: vectorRecord.articleVector,
      embedding_model: vectorRecord.embeddingModel,
      published,
      firstSeen: fixtureArticle.firstSeen ? new Date(fixtureArticle.firstSeen) : published
    });

    insertedArticleIds.push(article.id);
  }

  return insertedArticleIds;
}

// This function shortens event names for compact debug tables.
function compactName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

// This function maps topic IDs to the user's strongest matching island.
async function buildIslandLookups(userId) {
  const islands = await Island.findAll({
    where: { userId },
    attributes: ['id', 'label', 'weight', 'islandVector'],
    raw: true
  });
  const islandTopicRows = await IslandTopic.findAll({
    where: {
      islandId: { [Op.in]: islands.map(island => island.id) }
    },
    attributes: ['islandId', 'topicId'],
    raw: true
  });
  const islandById = new Map(islands.map(island => [String(island.id), island]));
  const islandByTopicId = islandTopicRows.reduce((topicIslands, row) => {
    const topicKey = String(row.topicId);
    const island = islandById.get(String(row.islandId));
    const currentIsland = topicIslands.get(topicKey);

    if (!island) return topicIslands;

    if (!currentIsland || Number(island.weight || 0) > Number(currentIsland.weight || 0)) {
      topicIslands.set(topicKey, island);
    }

    return topicIslands;
  }, new Map());

  return { islands, islandByTopicId };
}

// This function resolves an island label from the direct topic link or vector similarity.
function resolveIslandName(article, islandByTopicId, islands) {
  let islandName = compactName(islandByTopicId.get(String(article.topicId))?.label);

  if (islandName || !Number(article.interestScore || 0) || !article.articleVector) {
    return islandName;
  }

  let strongestIsland = null;
  let strongestScore = null;

  for (const island of islands) {
    const similarity = cosineSimilarity(article.articleVector, island.islandVector, {
      parseStrings: true,
      coerceNumbers: true
    });
    if (similarity < DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD) continue;

    const score = Number(island.weight || 0) * similarity;
    if (strongestScore === null || Math.abs(score) > Math.abs(strongestScore)) {
      strongestScore = score;
      strongestIsland = island;
    }
  }

  islandName = compactName(strongestIsland?.label);

  return islandName;
}

// This function prints the top recommended unread articles after the incremental unread pass.
async function printTopUnreadRecommendedDebug(userId) {
  const articles = await Article.findAll({
    where: {
      userId,
      status: 'unread'
    },
    include: [
      {
        model: Event,
        as: 'event',
        attributes: ['id', 'name', 'articleCount', 'sourceDiversityScore', 'sourceCount'],
        required: false
      },
      {
        model: Feed,
        attributes: ['id', 'feedTrust'],
        required: false
      },
      {
        model: Tag,
        attributes: ['id', 'tagType'],
        required: false
      }
    ]
  });
  const { islands, islandByTopicId } = await buildIslandLookups(userId);
  const rows = articles
    .map(article => {
      article.Tags = article.get?.('tags') ?? article.tags ?? article.Tags ?? [];

      return {
        article,
        recommended: computeRecommended(article)
      };
    })
    .sort((left, right) => (
      right.recommended - left.recommended ||
      Number(left.article.id) - Number(right.article.id)
    ))
    .slice(0, 25)
    .map(({ article, recommended }) => {
      const breakdown = computeRecommendedBreakdown(article);
      const event = article.get?.('event') ?? article.event ?? null;

      return {
        articleId: article.id,
        unread: article.status === 'unread',
        eventName: compactName(event?.name),
        islandName: resolveIslandName(article, islandByTopicId, islands),
        freshness: Number(breakdown.freshness.toFixed(4)),
        interestScore: Number(Number(article.interestScore || 0).toFixed(4)),
        coverage: Number(breakdown.coverage.toFixed(4)),
        crossSource: Number(breakdown.crossSource.toFixed(4)),
        corroboration: Number(breakdown.corroboration.toFixed(4)),
        clusterSize: breakdown.clusterSize,
        sourceCount: breakdown.sourceCount,
        recommended: Number(recommended.toFixed(4)),
        title: String(article.title || '').slice(0, 80)
      };
    });

  return rows;
}

semanticRegressionDescribe('semantic regression incremental unread ranking', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    expect(sequelize.getDatabaseName()).toBe(TEST_DATABASE_NAME);

    const user = await User.findOne({ where: { username: FIXTURE_USERNAME } });

    expect(user, 'semantic regression user must exist before incremental unread ranking pass').toBeTruthy();
    semanticRegressionUserId = user.id;
  }, 60000);

  afterAll(async () => {
    await printSemanticArticleRankingTable(semanticRegressionUserId, {
      newArticleIds: insertedArticleIdsForReport
    });
  });

  it('marks prior Take-Two articles read, inserts the next article, repairs recent events, and prints top unread recommendations', async () => {
    const userId = semanticRegressionUserId;
    const fixture = await loadFixture(INCREMENTAL_FIXTURE_PATH);
    const vectorFixture = await loadFixture(INCREMENTAL_VECTOR_FIXTURE_PATH);
    const vectorByContentSourceHash = buildVectorMap(vectorFixture);
    const targetArticles = await Article.findAll({
      where: {
        userId,
        id: { [Op.in]: TAKE_TWO_ARTICLE_IDS_TO_MARK_READ }
      },
      attributes: ['id', 'title', 'status'],
      raw: true
    });

    expect(targetArticles).toHaveLength(TAKE_TWO_ARTICLE_IDS_TO_MARK_READ.length);

    await Article.update(
      { status: 'read' },
      {
        where: {
          userId,
          id: { [Op.in]: TAKE_TWO_ARTICLE_IDS_TO_MARK_READ }
        }
      }
    );

    const incrementalInsertedAfter = new Date(Date.now() - 1000);
    const insertedArticleIds = await insertMissingFixtureArticles(
      userId,
      fixture,
      vectorByContentSourceHash,
      'https://fixtures.rssmonster.test/semantic-incremental.unread'
    );
    insertedArticleIdsForReport = insertedArticleIds;

    await runIncrementalEventsForUser(userId, { createdAfter: incrementalInsertedAfter });
    await scoreArticlesFromIslandsForUser(userId);

    const markedReadCount = await Article.count({
      where: {
        userId,
        id: { [Op.in]: TAKE_TWO_ARTICLE_IDS_TO_MARK_READ },
        status: 'read'
      }
    });
    const insertedUnreadCount = await Article.count({
      where: {
        id: { [Op.in]: insertedArticleIds },
        status: 'unread'
      }
    });
    const rows = await printTopUnreadRecommendedDebug(userId);

    expect(markedReadCount).toBe(TAKE_TWO_ARTICLE_IDS_TO_MARK_READ.length);
    expect(insertedArticleIds).toHaveLength(fixture.articles.length);
    expect(insertedUnreadCount).toBe(fixture.articles.length);
    expect(rows).toHaveLength(25);
    expect(rows.every(row => row.unread)).toBe(true);
    expect(rows[0].recommended).toBeGreaterThanOrEqual(rows.at(-1).recommended);

    await markSemanticRegressionArticles({
      userId,
      incrementalArticleIds: insertedArticleIds
    });
    await refreshSemanticRegressionTrace({
      userId,
      phase: 'incremental-unread',
      incrementalArticleIds: insertedArticleIds
    });
    await printSemanticRegressionTrace({
      userId,
      phase: 'incremental-unread'
    });
  }, 60000);
});




