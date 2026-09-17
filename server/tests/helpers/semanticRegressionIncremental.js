import { articleRecords } from '../../services/articles/articleRecords.js';
import { readSemanticFixtureFile as readFile } from './semanticBatchFixtures.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';

const {
  Category,
  Feed
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INCREMENTAL_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'semantic-regression-incremental.json');
export const INCREMENTAL_VECTOR_FIXTURE_PATH = await resolveSemanticVectorFixturePath(
  'semantic-regression-incremental'
);
export const FIXTURE_USERNAME = 'semantic-regression-user';
// All canonical incremental rows participate in the main run; isolated old gold tests are additional.
export const EXPECTED_INCREMENTAL_ARTICLE_COUNT = 1000;
export const isLongitudinal = article => String(article.sourceId || '').startsWith('long-');
export const isRealBackground = article => article.regression?.provenance === 'real' && article.regression?.scenario === 'real-background';
const isOccurrence = article => Boolean(article.regression) && !isRealBackground(article) && !isLongitudinal(article);

// This function loads a JSON fixture from disk.
export async function loadFixture(path) {
  const fixtureText = await readFile(path, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

// This function loads the incremental article fixture.
export async function loadIncrementalFixture({ occurrences = false } = {}) {
  const fixture = await loadFixture(INCREMENTAL_FIXTURE_PATH);
  return occurrences ? selectOccurrenceFixture(fixture) : fixture;
}

// Keep frozen vector spaces and legacy date normalization isolated from occurrence cases.
export function selectLegacyFixture(fixture) {
  const occurrenceFeedIds = new Set(fixture.articles.filter(isOccurrence).map(article => article.feedId));
  return {
    ...fixture,
    ...(fixture.feeds ? { feeds: fixture.feeds.filter(feed => !occurrenceFeedIds.has(feed.id)) } : {}),
    articles: fixture.articles.filter(article => !isOccurrence(article))
  };
}

export function selectOccurrenceFixture(fixture) {
  const articles = fixture.articles.filter(isOccurrence);
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
        'Run `npm run fixture:semantic-vectors` in server/ before this test.'
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
  const map = new Map();
  for (const article of vectorFixture.articles) {
    const record = { articleVector: article.articleVector, embeddingModel: article.embeddingModel || vectorFixture.embeddingModel };
    map.set(article.fixtureSourceId || article.contentSourceHash, record);
  }
  return map;
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
  const fixtureUrls = resolvedFixture.articles.map(a => a.url).filter(Boolean);
  const contentHashes = fixtureContentHashes({ articles: resolvedFixture.articles.filter(a => !isRealBackground(a)) });
  const rows = await articleRecords.findAll({
    where: {
      userId,
      ...(fixtureUrls.length ? { [Op.or]: [{ contentSourceHash: { [Op.in]: contentHashes } }, { url: { [Op.in]: fixtureUrls } }] }
        : { contentSourceHash: { [Op.in]: contentHashes } })
    },
    attributes: ['id'],
    raw: true
  });

  return rows.map(row => Number(row.id));
}

// Fixture URL identity preserves syndicated copies; older URL-less helpers use content hashes.
export async function insertMissingFixtureArticles(userId, fixture, vectorByContentSourceHash, urlPrefix, {
  preservePublishedAt = false, originMs = null
} = {}) {
  const categoryIdMap = await ensureFixtureCategories(userId, fixture.categories);
  const feedIdMap = await ensureFixtureFeeds(userId, fixture.feeds, categoryIdMap);
  const now = Date.now();
  const resolvePublished = buildFixturePublishedResolver(fixture.articles.filter(a => !isRealBackground(a) && !isLongitudinal(a)), now);
  const realTimes = fixture.articles.filter(isRealBackground).map(a => Date.parse(a.publishedAt));
  // Preserve spacing; newest real background is 30 minutes old, after the legacy one-hour anchor.
  const realShiftMs = realTimes.length ? now - 30 * 60 * 1000 - Math.max(...realTimes) : 0;
  let insertedCount = 0;

  for (const [index, fixtureArticle] of fixture.articles.entries()) {
    const real = isRealBackground(fixtureArticle);
    const longitudinal = isLongitudinal(fixtureArticle) || Boolean(fixtureArticle.regression?.batch);
    const content = articleContent(fixtureArticle);
    const contentSourceHash = hashContent(content);
    const existingArticle = await articleRecords.findOne({
      where: {
        userId,
        ...(fixtureArticle.sourceId && fixtureArticle.url ? { url: fixtureArticle.url } : { contentSourceHash })
      },
      attributes: ['id']
    });

    if (existingArticle) continue;

    const vectorRecord = vectorByContentSourceHash.get(fixtureArticle.sourceId) || vectorByContentSourceHash.get(contentSourceHash);
    if (!vectorRecord?.articleVector?.length) {
      throw new Error(`Missing semantic vector for fixture article ${contentSourceHash}`);
    }

    const fallbackPublished = new Date(now - (fixture.articles.length - index) * 5 * 60 * 1000);
    const publishedAt = longitudinal && originMs != null
      ? new Date(originMs + (fixtureArticle.regression.dayOffset * 24 + fixtureArticle.regression.hourOffset) * 3600000)
      : preservePublishedAt
      ? new Date(fixtureArticle.publishedAt)
      : real ? new Date(Date.parse(fixtureArticle.publishedAt) + realShiftMs) : resolvePublished(fixtureArticle, fallbackPublished);

    await articleRecords.create({
      userId,
      feedId: feedIdMap.get(fixtureArticle.feedId),
      status: fixtureArticle.status || 'unread',
      favoriteInd: fixtureArticle.favoriteInd || 0,
      positiveInd: fixtureArticle.positiveInd || 0,
      negativeInd: fixtureArticle.negativeInd || 0,
      clickedAmount: fixtureArticle.clickedAmount || 0,
      url: fixtureArticle.url || `${urlPrefix}/${index + 1}`,
      title: articleTitle(fixtureArticle, index),
      description: real || longitudinal ? fixtureArticle.description : fixtureArticle.description || content.slice(0, 500),
      contentOriginal: real || longitudinal ? fixtureArticle.contentOriginal : fixtureArticle.contentOriginal || content,
      contentHtml: real || longitudinal ? fixtureArticle.contentHtml : fixtureArticle.contentHtml || content,
      ...(real || longitudinal ? { contentText: fixtureArticle.contentText, language: fixtureArticle.language,
        qualityScore: fixtureArticle.qualityScore, advertisementScore: fixtureArticle.advertisementScore,
        sentimentScore: fixtureArticle.sentimentScore } : {}),
      ...(real || longitudinal ? {} : { contentSourceHash }),
      articleVector: vectorRecord.articleVector,
      embedding_model: vectorRecord.embeddingModel,
      publishedAt,
      firstSeen: real || longitudinal ? publishedAt : fixtureArticle.firstSeen ? new Date(fixtureArticle.firstSeen) : publishedAt
    });

    insertedCount++;
  }

  return insertedCount;
}
