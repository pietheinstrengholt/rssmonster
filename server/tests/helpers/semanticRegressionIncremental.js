import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';

const {
  Category,
  Feed,
  Article
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INCREMENTAL_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression-incremental.json');
export const INCREMENTAL_VECTOR_FIXTURE_PATH = await resolveSemanticVectorFixturePath(
  'semantic-regression-incremental'
);
export const FIXTURE_USERNAME = 'semantic-regression-user';
// The original corpus remains separate from the explicitly selected occurrence cases.
export const EXPECTED_INCREMENTAL_ARTICLE_COUNT = 91;

// This function loads a JSON fixture from disk.
export async function loadFixture(path) {
  const fixtureText = await readFile(path, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

// This function loads the incremental article fixture.
export async function loadIncrementalFixture({ occurrences = false } = {}) {
  const fixture = await loadFixture(INCREMENTAL_FIXTURE_PATH);
  return occurrences ? selectOccurrenceFixture(fixture) : selectLegacyFixture(fixture);
}

// Keep frozen vector spaces and legacy date normalization isolated from occurrence cases.
export function selectLegacyFixture(fixture) {
  const occurrenceFeedIds = new Set(fixture.articles.filter(article => article.regression).map(article => article.feedId));
  return {
    ...fixture,
    ...(fixture.feeds ? { feeds: fixture.feeds.filter(feed => !occurrenceFeedIds.has(feed.id)) } : {}),
    articles: fixture.articles.filter(article => !article.regression)
  };
}

export function selectOccurrenceFixture(fixture) {
  const articles = fixture.articles.filter(article => article.regression);
  const feedIds = new Set(articles.map(article => article.feedId));
  return { ...fixture, feeds: fixture.feeds.filter(feed => feedIds.has(feed.id)), articles };
}

// This function loads the incremental vector fixture with a clear remediation message.
export async function loadIncrementalVectorFixture() {
  try {
    return await loadFixture(INCREMENTAL_VECTOR_FIXTURE_PATH);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'Missing semantic incremental vector fixture. ' +
        'Run `npm run fixture:semantic-incremental-vectors` in server/ before this test.'
      );
    }

    throw err;
  }
}

// This function checks whether the incremental vector fixture is available.
export async function hasIncrementalVectorFixture() {
  try {
    await readFile(INCREMENTAL_VECTOR_FIXTURE_PATH, 'utf8');
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

// This function hashes article content using the same stable key as the vector fixtures.
export function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// This function maps content hashes to stored embedding vectors.
export function buildVectorMap(vectorFixture) {
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
export function articleContent(fixtureArticle) {
  return (
    fixtureArticle.contentHtml ||
    fixtureArticle.contentOriginal ||
    fixtureArticle.content ||
    fixtureArticle.title ||
    ''
  ).trim();
}

// This function derives a title when fixture rows do not include one.
export function articleTitle(fixtureArticle, articleIndex) {
  if (fixtureArticle.title) return fixtureArticle.title;

  const firstSentence = articleContent(fixtureArticle)
    .split('.')
    .find(Boolean)
    ?.trim();

  return firstSentence?.slice(0, 180) || `Semantic incremental fixture article ${articleIndex + 1}`;
}

// This function parses fixture dates with a deterministic fallback.
export function buildFixturePublishedResolver(fixtureArticles, now = Date.now()) {
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

// This function returns content hashes for every article in a fixture.
export function fixtureContentHashes(fixture) {
  return fixture.articles.map(article => hashContent(articleContent(article)));
}

// This function loads the database IDs for the incremental fixture articles.
export async function findIncrementalArticleIds(userId, fixture = null) {
  const resolvedFixture = fixture || await loadIncrementalFixture();
  const contentHashes = fixtureContentHashes(resolvedFixture);
  const rows = await Article.findAll({
    where: {
      userId,
      contentSourceHash: { [Op.in]: contentHashes }
    },
    attributes: ['id'],
    raw: true
  });

  return rows.map(row => Number(row.id));
}

// This function inserts any fixture articles that are not already present by content hash.
export async function insertMissingFixtureArticles(userId, fixture, vectorByContentSourceHash, urlPrefix, {
  preservePublishedAt = false
} = {}) {
  const categoryIdMap = await ensureFixtureCategories(userId, fixture.categories);
  const feedIdMap = await ensureFixtureFeeds(userId, fixture.feeds, categoryIdMap);
  const now = Date.now();
  const resolvePublished = buildFixturePublishedResolver(fixture.articles, now);
  let insertedCount = 0;

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

    if (existingArticle) continue;

    const vectorRecord = vectorByContentSourceHash.get(contentSourceHash);
    if (!vectorRecord?.articleVector?.length) {
      throw new Error(`Missing semantic vector for fixture article ${contentSourceHash}`);
    }

    const fallbackPublished = new Date(now - (fixture.articles.length - index) * 5 * 60 * 1000);
    const publishedAt = preservePublishedAt
      ? new Date(fixtureArticle.publishedAt)
      : resolvePublished(fixtureArticle, fallbackPublished);

    await Article.create({
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
      publishedAt,
      firstSeen: fixtureArticle.firstSeen ? new Date(fixtureArticle.firstSeen) : publishedAt
    });

    insertedCount++;
  }

  return insertedCount;
}
