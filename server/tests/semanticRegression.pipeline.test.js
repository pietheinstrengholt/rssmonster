import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';

import db from '../models/index.js';
import { reclusterForUser } from '../services/reconcile/reclusterForUser.js';
import { buildInterestIslandsForUser } from '../services/islands/buildInterestIslands.js';
import { computeRecommended, computeRecommendedBreakdown } from '../util/recommendedScore.js';

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
  IslandTopic,
  IslandTaxonomy,
  Tag
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression.json');
const VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression.vectors.json');
const TAXONOMY_VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'island-taxonomy.vectors.json');
const FIXTURE_USERNAME = 'semantic-regression-user';
const FIXTURE_PASSWORD = 'rssmonster';
const EXPECTED_MIN_EVENTS = 3;
const EXPECTED_MIN_TOPICS = 2;
const EXPECTED_MIN_ISLANDS = 1;
const EXPECTED_MIN_ASSIGNED_ARTICLES = 3;
const EXPECTED_MIN_TOPIC_LINKED_ARTICLES = 3;
const EXPECTED_MIN_ARTICLE_TOPIC_LINKS = 3;
const SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD = 0.02;
const SEMANTIC_FIXTURE_ISLAND_ARTICLE_SCORE_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_ARTICLE_SCORE_THRESHOLD || '0.62'
);
const REPORT_SEPARATOR = '-'.repeat(120);
const MAX_REPORTED_ARTICLES_PER_EVENT = 12;
const MAX_REPORTED_ARTICLES_PER_ISLAND = 20;
const MAX_REPORTED_FALLBACK_ARTICLES_PER_ISLAND = 8;
const RECOMMENDED_DEBUG_FORMULA =
  '0.20*freshness + 0.22*interest + 0.10*quality + 0.22*coverage + ' +
  '0.13*crossSource + 0.13*corroboration + eventBoost + ruleBoost';

let semanticRegressionUserId = null;

function loadFixture() {
  return readFile(FIXTURE_PATH, 'utf8').then(JSON.parse);
}

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

async function loadTaxonomyVectorFixture() {
  try {
    return await readFile(TAXONOMY_VECTOR_FIXTURE_PATH, 'utf8').then(JSON.parse);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'Missing taxonomy vector fixture. Run `npm run fixture:taxonomy-vectors` in server/ before this regression test.'
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
  VECTOR_FIXTURE_PATH,
  TAXONOMY_VECTOR_FIXTURE_PATH
])) ? describe : describe.skip;

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buildVectorMap(vectorFixture) {
  return new Map(
    vectorFixture.articles.map(article => [
      article.contentHash,
      {
        articleVector: article.articleVector,
        embeddingModel: article.embeddingModel || vectorFixture.embeddingModel
      }
    ])
  );
}

function titleFromContent(content, articleIndex) {
  const firstSentence = content.split('.').find(Boolean)?.trim() || `Semantic fixture article ${articleIndex + 1}`;
  return firstSentence.slice(0, 180);
}

function articleContent(fixtureArticle) {
  return (
    fixtureArticle.contentStripped ||
    fixtureArticle.contentOriginal ||
    fixtureArticle.content ||
    fixtureArticle.title ||
    ''
  ).trim();
}

function articleTitle(fixtureArticle, articleIndex) {
  return fixtureArticle.title || titleFromContent(articleContent(fixtureArticle), articleIndex);
}

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
  const recentOffsetMs = 60 * 60 * 1000;

  return (fixtureArticle, fallbackPublished) => {
    const fixtureTime = Date.parse(fixtureArticle.published);
    if (!Number.isFinite(fixtureTime)) return fallbackPublished;

    const position = (fixtureTime - minFixtureTime) / fixtureSpanMs;
    return new Date(now - recentOffsetMs - (1 - position) * normalizedWindowMs);
  };
}

function formatCell(value, width) {
  const text = String(value ?? '');
  if (text.length > width) {
    return `${text.slice(0, width - 3)}...`;
  }

  return text.padEnd(width, ' ');
}

function reportLine(message = '') {
  console.log(message);
}

function printDebugTable(rows, columns) {
  const widths = columns.map(column => {
    const values = rows.map(row => String(row[column] ?? ''));
    return Math.max(column.length, ...values.map(value => value.length));
  });

  reportLine(columns.map((column, index) => formatCell(column, widths[index])).join('  '));

  for (const row of rows) {
    reportLine(columns.map((column, index) => formatCell(row[column], widths[index])).join('  '));
  }
}

function formatMetric(value) {
  return Number(value || 0).toFixed(1);
}

function averageMetric(total, count) {
  if (!count) return formatMetric(0);

  return formatMetric(total / count);
}

function maxMetric(values) {
  return Math.max(0, ...values.map(value => Number(value || 0)));
}

function parseVector(vector) {
  if (Array.isArray(vector)) return vector;
  if (typeof vector !== 'string') return null;

  try {
    const parsed = JSON.parse(vector);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cosineSimilarity(vectorA, vectorB) {
  const a = parseVector(vectorA);
  const b = parseVector(vectorB);

  if (!a?.length || !b?.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const valueA = Number(a[index] || 0);
    const valueB = Number(b[index] || 0);

    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function eventArticleCount(event) {
  if (Array.isArray(event.articles)) {
    return event.articles.length;
  }

  return Number(event.articleCount || 0);
}

function parsePopulationAudit(populationAudit) {
  if (Array.isArray(populationAudit)) return populationAudit;
  if (typeof populationAudit !== 'string') return [];

  try {
    const parsed = JSON.parse(populationAudit);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function latestPopulationAuditEntry(island) {
  return parsePopulationAudit(island.populationAudit).at(-1) || null;
}

function islandAuditArticles(island) {
  const sourceArticles = latestPopulationAuditEntry(island)?.sourceArticles;
  if (!Array.isArray(sourceArticles?.articles)) return [];

  return sourceArticles.articles
    .map(article => ({
      id: Number(article.id),
      title: article.title || '-',
      favoriteInd: Number(article.favoriteInd || 0),
      clickedAmount: Number(article.clickedAmount || 0),
      negativeInd: Number(article.negativeInd || 0)
    }))
    .filter(article => Number.isFinite(article.id))
    .sort((a, b) => (
      b.favoriteInd - a.favoriteInd ||
      b.clickedAmount - a.clickedAmount ||
      b.negativeInd - a.negativeInd ||
      a.id - b.id
    ));
}

function formatArticleSignalSummary(article) {
  return `star=${article.favoriteInd} clicked=${article.clickedAmount} negative=${article.negativeInd}`;
}

function approximatelyEqualScore(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.0001;
}

function roundedScore(value) {
  return Number(Number(value || 0).toFixed(4));
}

function reportTitle(value) {
  return String(value || '-').replace(/\s+/g, ' ').trim();
}

function compactEventName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

// This function shortens island names for compact debug tables.
function compactIslandName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

function plainScoredArticle(article) {
  const feed = article.feed || article.Feed || null;
  const category = feed?.category || feed?.Category || null;

  return {
    id: Number(article.id),
    title: article.title || '-',
    interestScore: Number(article.interestScore || 0),
    articleVector: article.articleVector,
    favoriteInd: Number(article.favoriteInd || 0),
    clickedAmount: Number(article.clickedAmount || 0),
    negativeInd: Number(article.negativeInd || 0),
    feedName: feed?.feedName || null,
    categoryName: category?.name || null
  };
}

function recommendedDebugRows(articles, islandByTopicId) {
  return articles
    .map(article => {
      article.Tags = article.get?.('tags') ?? article.tags ?? article.Tags ?? [];

      return {
        article,
        recommended: computeRecommended(article)
      };
    })
    .sort((a, b) => (
      b.recommended - a.recommended ||
      Number(a.article.id) - Number(b.article.id)
    ))
    .map(({ article, recommended }) => {
      const breakdown = computeRecommendedBreakdown(article);
      const event = article.get?.('event') ?? article.event ?? null;
      const islandName = compactIslandName(islandByTopicId.get(String(article.topicId))?.label);

      return {
        articleId: article.id,
        eventName: compactEventName(event?.name),
        islandName,
        freshness: Number(breakdown.freshness.toFixed(4)),
        interestScore: Number(Number(article.interestScore || 0).toFixed(4)),
        coverage: Number(breakdown.coverage.toFixed(4)),
        crossSource: Number(breakdown.crossSource.toFixed(4)),
        corroboration: Number(breakdown.corroboration.toFixed(4)),
        clusterSize: breakdown.clusterSize,
        sourceCount: breakdown.sourceCount,
        recommended: Number(recommended.toFixed(4))
      };
    });
}

async function printRecommendedRegressionTable(userId) {
  const articles = await Article.findAll({
    where: { userId },
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
    ],
    order: [['id', 'ASC']]
  });

  const eventIds = articles
    .map(article => article.eventId)
    .filter(eventId => eventId != null);
  const articlesWithEvents = eventIds.length;
  const distinctEvents = new Set(eventIds).size;
  const eventCoveragePct = articles.length
    ? Number(((articlesWithEvents / articles.length) * 100).toFixed(1))
    : 0;

  const islands = await Island.findAll({
    where: { userId },
    order: [
      ['weight', 'DESC'],
      ['id', 'ASC']
    ]
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

  const rows = recommendedDebugRows(articles, islandByTopicId);

  console.log(`Fetched ${articles.length} articles from database (before in-memory filters)`);
  console.log(`[RECOMMENDED DEBUG] Formula: ${RECOMMENDED_DEBUG_FORMULA}`);
  console.log(
    `[RECOMMENDED DEBUG] articles=${articles.length} ` +
    `articlesWithEvents=${articlesWithEvents} ` +
    `events=${distinctEvents} ` +
    `eventCoverage=${eventCoveragePct}%`
  );
  printDebugTable(rows, [
    'articleId',
    'eventName',
    'islandName',
    'freshness',
    'interestScore',
    'coverage',
    'crossSource',
    'corroboration',
    'clusterSize',
    'sourceCount',
    'recommended'
  ]);

  return rows;
}

function buildIslandFallbackScores(islands, articles, threshold = SEMANTIC_FIXTURE_ISLAND_ARTICLE_SCORE_THRESHOLD) {
  const fallbackScoresByIslandId = new Map(islands.map(island => [String(island.id), []]));

  for (const article of articles) {
    const currentScore = roundedScore(article.interestScore);
    if (!currentScore) continue;

    for (const island of islands) {
      if (island.archivedInd) continue;

      const similarity = cosineSimilarity(article.articleVector, island.islandVector);
      if (similarity < threshold) continue;

      const islandWeight = Number(island.weight || 0);
      const score = roundedScore(islandWeight * similarity);
      if (!approximatelyEqualScore(currentScore, score)) continue;

      fallbackScoresByIslandId.get(String(island.id))?.push({
        islandId: String(island.id),
        articleId: Number(article.id),
        title: article.title || '-',
        similarity: Number(similarity.toFixed(4)),
        islandWeight: roundedScore(islandWeight),
        interestScore: currentScore,
        favoriteInd: Number(article.favoriteInd || 0),
        clickedAmount: Number(article.clickedAmount || 0),
        negativeInd: Number(article.negativeInd || 0),
        feedName: article.feedName || null,
        categoryName: article.categoryName || null
      });
    }
  }

  for (const scores of fallbackScoresByIslandId.values()) {
    scores.sort((a, b) => (
      Math.abs(b.interestScore) - Math.abs(a.interestScore) ||
      b.similarity - a.similarity ||
      a.articleId - b.articleId
    ));
  }

  return fallbackScoresByIslandId;
}

function summarizeInterestScores(scores) {
  if (!scores.length) {
    return {
      avg: formatMetric(0),
      max: formatMetric(0)
    };
  }

  const total = scores.reduce((sum, score) => sum + Number(score || 0), 0);
  const max = scores.reduce((best, score) => (
    Math.abs(score) > Math.abs(best) ? Number(score || 0) : best
  ), 0);

  return {
    avg: formatMetric(total / scores.length),
    max: formatMetric(max)
  };
}

async function loadCategoryReportRows(userId) {
  const categories = await Category.findAll({
    where: { userId },
    attributes: ['id', 'name'],
    include: [{
      model: Feed,
      required: false,
      attributes: ['id'],
      include: [{
        model: Article,
        required: false,
        attributes: ['id'],
        where: { userId }
      }]
    }],
    order: [
      ['categoryOrder', 'ASC'],
      ['name', 'ASC'],
      [Feed, 'feedName', 'ASC']
    ]
  });

  return categories.map(category => ({
    id: category.id,
    name: category.name,
    articleCount: (category.feeds || [])
      .reduce((sum, feed) => sum + (feed.articles?.length || 0), 0)
  }));
}

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

async function applyArticleVectors(userId, vectorByContentHash) {
  const articles = await Article.findAll({
    where: { userId },
    attributes: ['id', 'contentHash']
  });

  for (const article of articles) {
    const vectorRecord = vectorByContentHash.get(article.contentHash);

    if (!vectorRecord?.articleVector?.length) {
      throw new Error(`Missing semantic vector for inserted article ${article.id} (${article.contentHash})`);
    }

    await article.update({
      articleVector: vectorRecord.articleVector,
      embedding_model: vectorRecord.embeddingModel
    });
  }

  return articles.length;
}

async function loadIslandTaxonomyFixture(taxonomyVectorFixture) {
  await IslandTaxonomy.bulkCreate(
    taxonomyVectorFixture.taxonomy.map(row => ({
      identity: row.identity,
      categoryName: row.categoryName,
      displayName: row.displayName,
      description: row.description ?? null,
      status: row.status || 'active',
      vector: row.vector,
      embedding_model: row.embeddingModel || taxonomyVectorFixture.embeddingModel
    })),
    {
      updateOnDuplicate: [
        'categoryName',
        'displayName',
        'description',
        'status',
        'vector',
        'embedding_model',
        'updatedAt'
      ]
    }
  );

  return IslandTaxonomy.count({ where: { status: 'active' } });
}

async function printSemanticPipelineReport(userId, islandResult = null) {
  const categories = await loadCategoryReportRows(userId);
  const events = await Event.findAll({
    where: { userId },
    include: [
      {
        model: Topic,
        as: 'primaryTopic',
        required: false,
        attributes: ['id', 'name']
      },
      {
        model: Article,
        as: 'articles',
        required: false,
        attributes: ['id', 'title']
      }
    ],
    order: [
      ['articleCount', 'DESC'],
      ['id', 'ASC']
    ]
  });

  if (islandResult) {
    reportLine('');
    reportLine('BUILD INTEREST ISLANDS RESULT');
    reportLine(REPORT_SEPARATOR);
    reportLine(`${formatCell('topicScoredCount:', 28)} ${islandResult.topicScoredCount ?? '-'}`);
    reportLine(`${formatCell('fallbackScoredCount:', 28)} ${islandResult.fallbackScoredCount ?? '-'}`);
    reportLine(`${formatCell('rescoredArticleCount:', 28)} ${islandResult.rescoredArticleCount ?? '-'}`);
  }

  reportLine('');
  reportLine('CATEGORIES');
  reportLine(REPORT_SEPARATOR);
  reportLine(`${formatCell('ID', 6)} ${formatCell('Articles', 9)} Category Name`);
  reportLine(REPORT_SEPARATOR);

  for (const category of categories) {
    reportLine(
      `${formatCell(category.id, 6)} ` +
      `${formatCell(category.articleCount, 9)} ` +
      `${category.name}`
    );
  }

  reportLine('');
  reportLine('EVENTS');
  reportLine(REPORT_SEPARATOR);
  reportLine(
    `${formatCell('ID', 6)} ${formatCell('Articles', 9)} ${formatCell('Topic', 28)} Event Name`
  );
  reportLine(REPORT_SEPARATOR);

  for (const event of events) {
    const topicName = event.primaryTopic?.name || event.topicId || '-';
    reportLine(
      `${formatCell(event.id, 6)} ` +
      `${formatCell(eventArticleCount(event), 9)} ` +
      `${formatCell(topicName, 28)} ` +
      `${event.name || '-'}`
    );
  }

  for (const event of events) {
    const articles = (event.articles || [])
      .slice()
      .sort((a, b) => a.id - b.id);

    reportLine('');
    reportLine(`EVENT ${event.id} ARTICLES (${articles.length})`);
    reportLine(REPORT_SEPARATOR);

    for (const article of articles.slice(0, MAX_REPORTED_ARTICLES_PER_EVENT)) {
      reportLine(`- ${article.title}`);
    }

    if (articles.length > MAX_REPORTED_ARTICLES_PER_EVENT) {
      reportLine(`- ... ${articles.length - MAX_REPORTED_ARTICLES_PER_EVENT} more`);
    }
  }

  const islands = await Island.findAll({
    where: { userId },
    order: [
      ['weight', 'DESC'],
      ['id', 'ASC']
    ]
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

  const islandTopicCounts = islandTopicRows.reduce((counts, row) => {
    const key = String(row.islandId);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

  const [topicRows, articleTopicRows, eventTopicRows, scoredArticleRows] = await Promise.all([
    Topic.findAll({
      where: { userId },
      attributes: ['id', 'name'],
      raw: true
    }),
    ArticleTopic.findAll({
      attributes: ['articleId', 'topicId'],
      include: [{
        model: Article,
        required: true,
        attributes: [],
        where: { userId }
      }],
      raw: true
    }),
    EventTopic.findAll({
      attributes: ['eventId', 'topicId'],
      include: [{
        model: Event,
        required: true,
        attributes: [],
        where: { userId }
      }],
      raw: true
    }),
    Article.findAll({
      where: {
        userId,
        articleVector: { [Op.ne]: null },
        interestScore: { [Op.ne]: 0 }
      },
      attributes: [
        'id',
        'title',
        'interestScore',
        'articleVector',
        'favoriteInd',
        'clickedAmount',
        'negativeInd'
      ],
      include: [{
        model: Feed,
        required: false,
        attributes: ['id', 'feedName'],
        include: [{
          model: Category,
          required: false,
          attributes: ['id', 'name']
        }]
      }]
    })
  ]);

  const articleIdsByTopicId = articleTopicRows.reduce((topicArticles, row) => {
    const key = String(row.topicId);
    const articleIds = topicArticles.get(key) || new Set();
    articleIds.add(row.articleId);
    topicArticles.set(key, articleIds);

    return topicArticles;
  }, new Map());

  const eventIdsByTopicId = eventTopicRows.reduce((topicEvents, row) => {
    const key = String(row.topicId);
    const eventIds = topicEvents.get(key) || new Set();
    eventIds.add(row.eventId);
    topicEvents.set(key, eventIds);

    return topicEvents;
  }, new Map());

  const articleIdsByIslandId = islandTopicRows.reduce((islandArticles, row) => {
    const islandKey = String(row.islandId);
    const topicArticleIds = articleIdsByTopicId.get(String(row.topicId)) || new Set();
    const articleIds = islandArticles.get(islandKey) || new Set();

    for (const articleId of topicArticleIds) {
      articleIds.add(articleId);
    }

    islandArticles.set(islandKey, articleIds);

    return islandArticles;
  }, new Map());

  const eventIdsByIslandId = islandTopicRows.reduce((islandEvents, row) => {
    const islandKey = String(row.islandId);
    const topicEventIds = eventIdsByTopicId.get(String(row.topicId)) || new Set();
    const eventIds = islandEvents.get(islandKey) || new Set();

    for (const eventId of topicEventIds) {
      eventIds.add(eventId);
    }

    islandEvents.set(islandKey, eventIds);

    return islandEvents;
  }, new Map());
  const scoredArticles = scoredArticleRows.map(plainScoredArticle);
  const scoredArticleById = new Map(scoredArticles.map(article => [Number(article.id), article]));
  const fallbackScoresByIslandId = buildIslandFallbackScores(islands, scoredArticles);

  const eventArticleCounts = events.map(eventArticleCount);
  const clusteredArticleCount = eventArticleCounts.reduce((sum, count) => sum + count, 0);
  const linkedEventCount = [...eventIdsByTopicId.values()]
    .reduce((sum, eventIds) => sum + eventIds.size, 0);
  const linkedIslandTopicCount = [...islandTopicCounts.values()]
    .reduce((sum, topicCount) => sum + topicCount, 0);

  const topicReportRows = topicRows
    .map(topic => ({
      id: topic.id,
      name: topic.name,
      eventCount: eventIdsByTopicId.get(String(topic.id))?.size || 0,
      articleCount: articleIdsByTopicId.get(String(topic.id))?.size || 0,
      islandLabel: islandByTopicId.get(String(topic.id))?.label || '-'
    }))
    .sort((a, b) => b.articleCount - a.articleCount || b.eventCount - a.eventCount || a.id - b.id);

  reportLine('');
  reportLine('TOPICS');
  reportLine(REPORT_SEPARATOR);
  reportLine(
    `${formatCell('ID', 6)} ` +
    `${formatCell('Events', 8)} ` +
    `${formatCell('Articles', 10)} ` +
    `${formatCell('Island', 20)} ` +
    'Topic Name'
  );
  reportLine(REPORT_SEPARATOR);

  for (const topic of topicReportRows) {
    reportLine(
      `${formatCell(topic.id, 6)} ` +
      `${formatCell(topic.eventCount, 8)} ` +
      `${formatCell(topic.articleCount, 10)} ` +
      `${formatCell(topic.islandLabel, 20)} ` +
      `${topic.name}`
    );
  }

  reportLine('');
  reportLine('ISLANDS');
  reportLine(REPORT_SEPARATOR);
  reportLine(
    `${formatCell('ID', 6)} ` +
    `${formatCell('Topics', 7)} ` +
    `${formatCell('Events', 7)} ` +
    `${formatCell('topicLinkedArticles', 20)} ` +
    `${formatCell('fallbackScoredArticles', 22)} ` +
    `${formatCell('totalScoredArticles', 20)} ` +
    `${formatCell('avgScore', 8)} ` +
    `${formatCell('maxScore', 8)} ` +
    'Island'
  );
  reportLine(REPORT_SEPARATOR);

  for (const island of islands) {
    const islandKey = String(island.id);
    const topicLinkedArticleIds = articleIdsByIslandId.get(islandKey) || new Set();
    const fallbackScores = fallbackScoresByIslandId.get(islandKey) || [];
    const scoredArticleIds = new Set([
      ...topicLinkedArticleIds,
      ...fallbackScores.map(row => row.articleId)
    ]);
    const scoreSummary = summarizeInterestScores(
      [...scoredArticleIds]
        .map(articleId => scoredArticleById.get(Number(articleId))?.interestScore)
        .filter(score => score !== undefined)
    );

    reportLine(
      `${formatCell(island.id, 6)} ` +
      `${formatCell(islandTopicCounts.get(islandKey) || 0, 7)} ` +
      `${formatCell(eventIdsByIslandId.get(islandKey)?.size || 0, 7)} ` +
      `${formatCell(topicLinkedArticleIds.size, 20)} ` +
      `${formatCell(fallbackScores.length, 22)} ` +
      `${formatCell(scoredArticleIds.size, 20)} ` +
      `${formatCell(scoreSummary.avg, 8)} ` +
      `${formatCell(scoreSummary.max, 8)} ` +
      `${island.label}`
    );
  }

  reportLine('');
  reportLine('ISLAND EXPLANATIONS');
  reportLine(REPORT_SEPARATOR);

  for (const island of islands) {
    if (island.archivedInd) continue;

    const islandKey = String(island.id);
    const fallbackScores = fallbackScoresByIslandId.get(islandKey) || [];

    reportLine(`ISLAND ${island.id}: ${island.label}`);
    reportLine(`weight=${roundedScore(island.weight)} fallbackScoredArticles=${fallbackScores.length}`);
    reportLine('');
    reportLine('Top fallback-scored articles:');

    for (const article of fallbackScores.slice(0, MAX_REPORTED_FALLBACK_ARTICLES_PER_ISLAND)) {
      const source = [
        article.feedName,
        article.categoryName
      ].filter(Boolean).join(' / ');
      const sourceSuffix = source ? ` (${source})` : '';

      reportLine(
        `- score=${article.interestScore.toFixed(4)} ` +
        `sim=${article.similarity.toFixed(4)} ` +
        `[star=${article.favoriteInd} clicked=${article.clickedAmount} negative=${article.negativeInd}] ` +
        `${reportTitle(article.title)}${sourceSuffix}`
      );
    }

    if (!fallbackScores.length) {
      reportLine('- none');
    }

    reportLine('');
  }

  for (const island of islands) {
    const articles = islandAuditArticles(island);

    reportLine('');
    reportLine(`ISLAND ${island.id} INPUT ARTICLES (${articles.length})`);
    reportLine(REPORT_SEPARATOR);

    for (const article of articles.slice(0, MAX_REPORTED_ARTICLES_PER_ISLAND)) {
      reportLine(`- [${formatArticleSignalSummary(article)}] ${article.title}`);
    }

    if (articles.length > MAX_REPORTED_ARTICLES_PER_ISLAND) {
      reportLine(`- ... ${articles.length - MAX_REPORTED_ARTICLES_PER_ISLAND} more`);
    }

    if (!articles.length) {
      reportLine('- none recorded');
    }
  }

  reportLine('');
  reportLine('CLUSTER HEALTH');
  reportLine(REPORT_SEPARATOR);
  reportLine(`${formatCell('Avg articles/event:', 28)} ${averageMetric(clusteredArticleCount, events.length)}`);
  reportLine(`${formatCell('Avg events/topic:', 28)} ${averageMetric(linkedEventCount, topicRows.length)}`);
  reportLine(`${formatCell('Avg topics/island:', 28)} ${averageMetric(linkedIslandTopicCount, islands.length)}`);
  reportLine('');
  reportLine(`${formatCell('Largest event:', 28)} ${maxMetric(eventArticleCounts)} articles`);
  reportLine(
    `${formatCell('Largest topic:', 28)} ` +
    `${maxMetric([...articleIdsByTopicId.values()].map(articleIds => articleIds.size))} articles`
  );
  reportLine(
    `${formatCell('Largest island:', 28)} ` +
    `${maxMetric([...articleIdsByIslandId.values()].map(articleIds => articleIds.size))} articles`
  );
}

semanticRegressionDescribe('semantic regression fixture pipeline', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await deleteExistingFixtureUser();
  });

  it('loads semantic fixture content and reclusters it', async () => {
    const fixture = await loadFixture();
    const vectorFixture = await loadVectorFixture();
    const taxonomyVectorFixture = await loadTaxonomyVectorFixture();
    const vectorByContentHash = buildVectorMap(vectorFixture);

    expect(fixture.feeds.length).toBeGreaterThan(0);
    expect(fixture.articles.length).toBeGreaterThan(0);
    expect(taxonomyVectorFixture.taxonomy.length).toBeGreaterThan(0);

    const missingVectorArticles = fixture.articles
      .map((article, index) => {
        const content = articleContent(article);

        return {
          index,
          contentHash: hashContent(content),
          preview: content.slice(0, 160)
        };
      })
      .filter(article => !vectorByContentHash.has(article.contentHash));

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
      const contentHash = hashContent(content);
      const fallbackPublished = new Date(now - (fixture.articles.length - index) * 5 * 60 * 1000);
      const published = resolvePublished(fixtureArticle, fallbackPublished);

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
        contentStripped: fixtureArticle.contentStripped || content,
        contentHash,
        published,
        firstSeen: published
      };
    });

    await Article.bulkCreate(articles);
    const vectorizedArticleCount = await applyArticleVectors(user.id, vectorByContentHash);

    expect(vectorizedArticleCount).toBe(fixture.articles.length);

    await reclusterForUser(user.id);
    const taxonomyCount = await loadIslandTaxonomyFixture(taxonomyVectorFixture);
    const islandResult = await buildInterestIslandsForUser(user.id, {
      topicConfidenceThreshold: SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD
    });
    await printSemanticPipelineReport(user.id, islandResult);

    const [
      feedCount,
      articleCount,
      eventCount,
      topicCount,
      islandCount,
      assignedArticleCount,
      topicLinkedArticleCount,
      articleTopicLinkCount,
      eventTopicLinkCount,
      islandTopicLinkCount,
      negativeSignalScoredArticleCount
    ] = await Promise.all([
      Feed.count({ where: { userId: user.id } }),
      Article.count({ where: { userId: user.id } }),
      Event.count({ where: { userId: user.id } }),
      Topic.count({ where: { userId: user.id } }),
      Island.count({ where: { userId: user.id } }),
      Article.count({ where: { userId: user.id, eventId: { [Op.ne]: null } } }),
      Article.count({ where: { userId: user.id, topicId: { [Op.ne]: null } } }),
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
      IslandTopic.count({
        include: [{
          model: Island,
          required: true,
          attributes: [],
          where: { userId: user.id }
        }]
      }),
      Article.count({
        where: {
          userId: user.id,
          negativeInd: 1,
          interestScore: { [Op.ne]: 0 }
        }
      })
    ]);

    expect(feedCount).toBe(fixture.feeds.length);
    expect(articleCount).toBe(fixture.articles.length);
    expect(eventCount).toBeGreaterThanOrEqual(EXPECTED_MIN_EVENTS);
    expect(topicCount).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPICS);
    expect(taxonomyCount).toBeGreaterThan(0);
    expect(islandResult.islandCount).toBeGreaterThanOrEqual(EXPECTED_MIN_ISLANDS);
    expect(islandCount).toBeGreaterThanOrEqual(EXPECTED_MIN_ISLANDS);
    expect(assignedArticleCount).toBeGreaterThanOrEqual(EXPECTED_MIN_ASSIGNED_ARTICLES);
    expect(topicLinkedArticleCount).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPIC_LINKED_ARTICLES);
    expect(articleTopicLinkCount).toBeGreaterThanOrEqual(EXPECTED_MIN_ARTICLE_TOPIC_LINKS);
    expect(eventTopicLinkCount).toBeGreaterThanOrEqual(EXPECTED_MIN_TOPICS);
    expect(islandTopicLinkCount).toBeGreaterThanOrEqual(EXPECTED_MIN_ISLANDS);
    expect(negativeSignalScoredArticleCount).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('prints recommended-score ranking for the semantic fixture articles', async () => {
    const userId = semanticRegressionUserId ?? (await User.findOne({
      where: { username: FIXTURE_USERNAME },
      attributes: ['id'],
      raw: true
    }))?.id;

    expect(userId, 'semantic regression fixture user should be created by the pipeline test').toBeTruthy();

    const rows = await printRecommendedRegressionTable(userId);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].recommended).toBeGreaterThanOrEqual(rows.at(-1).recommended);
  }, 60000);
});
