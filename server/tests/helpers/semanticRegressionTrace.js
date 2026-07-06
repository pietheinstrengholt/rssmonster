import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Op } from 'sequelize';

import db from '../../models/index.js';
import { cosineSimilarity } from '../../services/vectors/index.js';
import { computeRecommended, computeRecommendedBreakdown } from '../../util/recommendedScore.js';
import { normalizeIslandName } from '../../services/islands/islandNameDisambiguation.js';

const {
  Article,
  Event,
  Topic,
  ArticleTopic,
  EventTopic,
  Island,
  IslandTopic,
  Feed,
  Tag
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACE_DIR = join(__dirname, '..', '.semantic-regression');
const TRACE_PATH = join(TRACE_DIR, 'trace.json');
const DEFAULT_LIMIT = 140;
const DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_ARTICLE_SCORE_THRESHOLD || '0.62'
);

// This function creates a stable compact name for trace tables.
function compactLabel(name, maxWords = 3) {
  if (!name || typeof name !== 'string') return '-';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join(' ') || '-';
}

// This function formats a compact fixed-width trace table cell.
function formatCell(value, width) {
  const text = String(value ?? '');
  if (text.length > width) return text.slice(0, width - 1);

  return text.padEnd(width, ' ');
}

// This function formats a numeric score for trace output.
function formatScore(value, digits = 3) {
  return Number(value || 0).toFixed(digits);
}

// This function reads the persisted semantic trace from disk.
async function readTrace() {
  try {
    return JSON.parse(await readFile(TRACE_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// This function writes the persisted semantic trace to disk.
async function writeTrace(trace) {
  await mkdir(TRACE_DIR, { recursive: true });
  await writeFile(TRACE_PATH, `${JSON.stringify(trace, null, 2)}\n`);
}

// This function creates an empty semantic trace document.
function createTrace({ userId, baselineArticleIds = [], incrementalArticleIds = [] }) {
  const now = new Date().toISOString();

  return {
    runId: `${now}-${userId}`,
    userId,
    updatedAt: now,
    baselineArticleIds: baselineArticleIds.map(Number),
    incrementalArticleIds: incrementalArticleIds.map(Number),
    snapshots: {
      eventIds: [],
      topicIds: [],
      islandIds: []
    },
    articles: {}
  };
}

// This function returns a trace, creating one when a prior phase did not.
async function readOrCreateTrace({ userId, baselineArticleIds = [], incrementalArticleIds = [] }) {
  const trace = await readTrace();

  if (trace?.userId === userId) return trace;

  return createTrace({ userId, baselineArticleIds, incrementalArticleIds });
}

// This function merges article source identity into a trace.
function markArticles(trace, { baselineArticleIds = [], incrementalArticleIds = [] }) {
  const baselineIdSet = new Set([
    ...(trace.baselineArticleIds || []),
    ...baselineArticleIds
  ].map(Number));
  const incrementalIdSet = new Set([
    ...(trace.incrementalArticleIds || []),
    ...incrementalArticleIds
  ].map(Number));

  trace.baselineArticleIds = [...baselineIdSet].sort((left, right) => left - right);
  trace.incrementalArticleIds = [...incrementalIdSet].sort((left, right) => left - right);

  for (const articleId of trace.baselineArticleIds) {
    const key = String(articleId);
    trace.articles[key] = {
      ...(trace.articles[key] || {}),
      articleId,
      source: 'baseline',
      isNew: false
    };
  }

  for (const articleId of trace.incrementalArticleIds) {
    const key = String(articleId);
    trace.articles[key] = {
      ...(trace.articles[key] || {}),
      articleId,
      source: 'incremental',
      isNew: true
    };
  }
}

// This function resets the cross-file semantic regression trace.
export async function resetSemanticRegressionTrace({ userId, baselineArticleIds = [], incrementalArticleIds = [] }) {
  const trace = createTrace({ userId, baselineArticleIds, incrementalArticleIds });

  markArticles(trace, { baselineArticleIds, incrementalArticleIds });
  await writeTrace(trace);

  return trace;
}

// This function marks baseline and incremental fixture articles in the shared trace.
export async function markSemanticRegressionArticles({ userId, baselineArticleIds = [], incrementalArticleIds = [] }) {
  const trace = await readOrCreateTrace({ userId, baselineArticleIds, incrementalArticleIds });

  markArticles(trace, { baselineArticleIds, incrementalArticleIds });
  trace.updatedAt = new Date().toISOString();
  await writeTrace(trace);

  return trace;
}

// This function returns the strongest topic link for an article from authoritative tables.
function resolveTopicForArticle(article, eventTopicByEventId, articleTopicByArticleId, topicById) {
  const eventTopic = article.eventId ? eventTopicByEventId.get(Number(article.eventId)) : null;
  const articleTopic = articleTopicByArticleId.get(Number(article.id));
  const topicId = Number(eventTopic?.topicId || articleTopic?.topicId || article.topicId || 0);

  if (!topicId) return { topic: null, topicSource: null };

  return {
    topic: topicById.get(topicId) || null,
    topicSource: eventTopic ? 'event-topic' : articleTopic ? 'article-topic' : 'denormalized'
  };
}

// This function resolves the strongest island reached through an article topic.
function resolveTopicIsland(topicId, islandTopicByTopicId, islandById) {
  if (!topicId) return null;

  const islandTopic = islandTopicByTopicId.get(Number(topicId));
  if (!islandTopic) return null;

  return islandById.get(Number(islandTopic.islandId)) || null;
}

// This function resolves a direct vector fallback island for scored articles.
function resolveVectorFallbackIsland(article, islands) {
  if (!Number(article.interestScore || 0) || !article.articleVector) return null;

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

  return strongestIsland;
}

// This function resolves the semantic island and how the article reached it.
function resolveIslandForArticle(article, topic, islandTopicByTopicId, islandById, islands) {
  const topicIsland = resolveTopicIsland(topic?.id, islandTopicByTopicId, islandById);
  if (topicIsland) {
    return {
      island: topicIsland,
      islandDecision: 'topic-island'
    };
  }

  const fallbackIsland = resolveVectorFallbackIsland(article, islands);
  if (fallbackIsland) {
    return {
      island: fallbackIsland,
      islandDecision: 'vector-fallback'
    };
  }

  return {
    island: null,
    islandDecision: 'no-island'
  };
}

// This function derives a stable semantic path from resolved relationships.
function buildSemanticPath({ article, topic, islandDecision }) {
  const hasEvent = Boolean(article.eventId);
  const hasTopic = Boolean(topic);
  const hasTopicIsland = islandDecision === 'topic-island';
  const hasFallbackIsland = islandDecision === 'vector-fallback';

  if (hasTopicIsland && hasEvent && hasTopic) return 'A→E→T→I';
  if (hasTopicIsland && hasTopic) return 'A→T→I';
  if (hasFallbackIsland && hasEvent) return 'A→E→I (fallback)';
  if (hasFallbackIsland) return 'A→I (fallback)';
  if (hasEvent && hasTopic) return 'A→E→T';
  if (hasEvent) return 'A→E';
  if (hasTopic) return 'A→T';

  return 'A';
}

// This function derives event decisions from the source and prior trace snapshot.
function deriveEventDecision({ article, previousRow, previousEventIds, isIncremental }) {
  if (!article.eventId) return 'eventless';
  if (!isIncremental) return previousRow?.eventDecision || 'baseline-event';
  if (previousRow?.eventDecision && previousRow.eventDecision !== 'eventless') return previousRow.eventDecision;

  return previousEventIds.has(Number(article.eventId)) ? 'existing-event' : 'new-event';
}

// This function derives topic decisions from the source and prior trace snapshot.
function deriveTopicDecision({ topic, previousRow, previousTopicIds, isIncremental }) {
  if (!topic?.id) return 'no-topic';
  if (!isIncremental) return previousRow?.topicDecision || 'baseline-topic';
  if (previousRow?.topicDecision && previousRow.topicDecision !== 'no-topic') return previousRow.topicDecision;

  return previousTopicIds.has(Number(topic.id)) ? 'existing-topic' : 'new-topic';
}

// This function orders semantic relationship rows by primary flag, rank, confidence, and id.
function compareRelationRows(left, right) {
  return (
    Number(right.primaryInd || 0) - Number(left.primaryInd || 0) ||
    Number(left.rank || 9999) - Number(right.rank || 9999) ||
    Number(right.confidence || 0) - Number(left.confidence || 0) ||
    Number(left.id || 0) - Number(right.id || 0)
  );
}

// This function picks the strongest relationship row for each owner.
function strongestRelationBy(ownerKey, rows) {
  const grouped = new Map();

  for (const row of rows) {
    const ownerId = Number(row[ownerKey]);
    const current = grouped.get(ownerId);

    if (!current || compareRelationRows(row, current) < 0) {
      grouped.set(ownerId, row);
    }
  }

  return grouped;
}

// This function loads relationship lookups needed for the semantic trace.
async function loadTraceLookups(userId, articles) {
  const articleIds = articles.map(article => Number(article.id));
  const eventIds = [...new Set(articles.map(article => Number(article.eventId || 0)).filter(Boolean))];
  const [articleTopicRows, eventTopicRows, topics, islands, islandTopicRows] = await Promise.all([
    articleIds.length
      ? ArticleTopic.findAll({
        where: { articleId: { [Op.in]: articleIds } },
        order: [['articleId', 'ASC'], ['primaryInd', 'DESC'], ['rank', 'ASC'], ['confidence', 'DESC']],
        raw: true
      })
      : [],
    eventIds.length
      ? EventTopic.findAll({
        where: { eventId: { [Op.in]: eventIds } },
        order: [['eventId', 'ASC'], ['primaryInd', 'DESC'], ['rank', 'ASC'], ['confidence', 'DESC']],
        raw: true
      })
      : [],
    Topic.findAll({
      where: { userId },
      attributes: ['id', 'name'],
      raw: true
    }),
    Island.findAll({
      where: { userId, archivedInd: false },
      attributes: ['id', 'label', 'weight', 'islandVector'],
      raw: true
    }),
    IslandTopic.findAll({
      include: [{
        model: Island,
        required: true,
        attributes: [],
        where: { userId, archivedInd: false }
      }],
      order: [['topicId', 'ASC'], ['confidence', 'DESC'], ['similarity', 'DESC']],
      raw: true
    })
  ]);
  const topicById = new Map(topics.map(topic => [Number(topic.id), topic]));
  const islandById = new Map(islands.map(island => [Number(island.id), island]));

  return {
    topics,
    islands,
    islandTopicRows,
    articleTopicByArticleId: strongestRelationBy('articleId', articleTopicRows),
    eventTopicByEventId: strongestRelationBy('eventId', eventTopicRows),
    islandTopicByTopicId: strongestRelationBy('topicId', islandTopicRows),
    topicById,
    islandById
  };
}

// This function builds one persisted trace row from current DB state.
function buildTraceRow({
  article,
  trace,
  phase,
  previousEventIds,
  previousTopicIds,
  event,
  topic,
  island,
  islandDecision,
  topicSource
}) {
  article.Tags = article.get?.('tags') ?? article.tags ?? article.Tags ?? [];

  const articleId = Number(article.id);
  const previousRow = trace.articles[String(articleId)] || {};
  const isIncremental = trace.incrementalArticleIds?.map(Number).includes(articleId);
  const source = isIncremental ? 'incremental' : 'baseline';
  const breakdown = computeRecommendedBreakdown(article);
  const recommended = computeRecommended(article);

  return {
    ...previousRow,
    articleId,
    source,
    isNew: isIncremental,
    title: article.title || '',
    phase,
    eventId: event?.id ? Number(event.id) : null,
    eventName: event?.name || null,
    eventDecision: deriveEventDecision({
      article,
      previousRow,
      previousEventIds,
      isIncremental
    }),
    topicId: topic?.id ? Number(topic.id) : null,
    topicName: topic?.name || null,
    topicSource,
    topicDecision: deriveTopicDecision({
      topic,
      previousRow,
      previousTopicIds,
      isIncremental
    }),
    islandId: island?.id ? Number(island.id) : null,
    islandName: island?.label || null,
    islandDecision,
    semanticPath: buildSemanticPath({ article, topic, islandDecision }),
    freshness: Number(breakdown.freshness || 0),
    interestScore: Number(article.interestScore || 0),
    coverage: Number(breakdown.coverage || 0),
    crossSource: Number(breakdown.crossSource || 0),
    corroboration: Number(breakdown.corroboration || 0),
    clusterSize: Number(breakdown.clusterSize || 1),
    sourceCount: Number(breakdown.sourceCount || 1),
    recommended: Number(recommended || 0)
  };
}

// This function refreshes the shared semantic trace from current DB state.
export async function refreshSemanticRegressionTrace({ userId, phase, incrementalArticleIds = [] }) {
  if (!userId) return null;

  const trace = await readOrCreateTrace({ userId, incrementalArticleIds });
  markArticles(trace, { incrementalArticleIds });

  const previousEventIds = new Set((trace.snapshots?.eventIds || []).map(Number));
  const previousTopicIds = new Set((trace.snapshots?.topicIds || []).map(Number));
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
  const lookups = await loadTraceLookups(userId, articles);

  for (const article of articles) {
    const event = article.get?.('event') ?? article.event ?? null;
    const { topic, topicSource } = resolveTopicForArticle(
      article,
      lookups.eventTopicByEventId,
      lookups.articleTopicByArticleId,
      lookups.topicById
    );
    const { island, islandDecision } = resolveIslandForArticle(
      article,
      topic,
      lookups.islandTopicByTopicId,
      lookups.islandById,
      lookups.islands
    );

    trace.articles[String(article.id)] = buildTraceRow({
      article,
      trace,
      phase,
      previousEventIds,
      previousTopicIds,
      event,
      topic,
      island,
      islandDecision,
      topicSource
    });
  }

  trace.snapshots = {
    eventIds: await Event.findAll({
      where: { userId },
      attributes: ['id'],
      raw: true
    }).then(rows => rows.map(row => Number(row.id)).sort((left, right) => left - right)),
    topicIds: lookups.topics.map(topic => Number(topic.id)).sort((left, right) => left - right),
    islandIds: lookups.islands.map(island => Number(island.id)).sort((left, right) => left - right)
  };
  trace.phase = phase;
  trace.updatedAt = new Date().toISOString();
  await writeTrace(trace);

  return trace;
}

// This function builds architecture health metrics from a trace and current DB state.
async function buildArchitectureHealth(trace, userId) {
  const rows = Object.values(trace.articles || {});
  const [events, islands] = await Promise.all([
    Event.findAll({
      where: { userId },
      attributes: ['id', 'articleCount'],
      raw: true
    }),
    Island.findAll({
      where: { userId, archivedInd: false },
      attributes: ['id', 'label'],
      raw: true
    })
  ]);
  const islandNameCounts = islands.reduce((counts, island) => {
    const normalizedName = normalizeIslandName(island.label);
    if (!normalizedName) return counts;
    counts.set(normalizedName, (counts.get(normalizedName) || 0) + 1);
    return counts;
  }, new Map());

  return {
    Articles: rows.length,
    'Baseline articles': rows.filter(row => row.source === 'baseline').length,
    'Incremental articles': rows.filter(row => row.source === 'incremental').length,
    'Articles with events': rows.filter(row => row.eventId).length,
    'Articles with topics': rows.filter(row => row.topicId).length,
    'Articles with topic-island path': rows.filter(row => row.islandDecision === 'topic-island').length,
    'Articles with fallback island': rows.filter(row => row.islandDecision === 'vector-fallback').length,
    'Standalone articles': rows.filter(row => row.semanticPath === 'A').length,
    'One-article events': events.filter(event => Number(event.articleCount || 0) === 1).length,
    'Duplicate island names': [...islandNameCounts.values()].filter(count => count > 1).length,
    'Incremental joined existing': rows.filter(row => row.eventDecision === 'existing-event').length,
    'Incremental new events': rows.filter(row => row.eventDecision === 'new-event').length,
    'Incremental eventless': rows.filter(row => row.source === 'incremental' && row.eventDecision === 'eventless').length
  };
}

// This function prints the semantic trace architecture health block.
function printArchitectureHealth(health) {
  console.log('[SEMANTIC TRACE] Architecture health');

  for (const [label, value] of Object.entries(health)) {
    console.log(`${label.padEnd(32, '.')} ${value}`);
  }
}

// This function returns deterministic, ranked trace rows.
function sortedTraceRows(trace, limit) {
  const rows = Object.values(trace.articles || {})
    .sort((left, right) => (
      Number(right.recommended || 0) - Number(left.recommended || 0) ||
      Number(right.isNew || false) - Number(left.isNew || false) ||
      Number(left.articleId || 0) - Number(right.articleId || 0)
    ));

  return Number.isInteger(limit) ? rows.slice(0, limit) : rows;
}

// This function prints the cross-file semantic regression trace.
export async function printSemanticRegressionTrace({ userId, phase, limit = DEFAULT_LIMIT }) {
  const trace = await readTrace();
  if (!trace || trace.userId !== userId) return [];

  console.log(`[SEMANTIC TRACE] ${phase || trace.phase || 'semantic-regression'}`);
  printArchitectureHealth(await buildArchitectureHealth(trace, userId));

  const columns = [
    ['ID', 5],
    ['New', 4],
    ['Path', 18],
    ['Event', 18],
    ['Topic', 16],
    ['Island', 18],
    ['EventDecision', 15],
    ['TopicDecision', 15],
    ['IslandDecision', 16],
    ['Fresh', 6],
    ['Int.', 5],
    ['Cov.', 5],
    ['Cross', 6],
    ['Corr', 5],
    ['Rec.', 5],
    ['Title', 60]
  ];

  console.log(columns.map(([label, width]) => formatCell(label, width)).join('  '));

  const rows = sortedTraceRows(trace, limit);
  for (const row of rows) {
    console.log([
      formatCell(row.articleId, 5),
      formatCell(row.isNew ? '*' : '', 4),
      formatCell(row.semanticPath || 'A', 18),
      formatCell(compactLabel(row.eventName), 18),
      formatCell(compactLabel(row.topicName), 16),
      formatCell(compactLabel(row.islandName), 18),
      formatCell(row.eventDecision || '-', 15),
      formatCell(row.topicDecision || '-', 15),
      formatCell(row.islandDecision || '-', 16),
      formatCell(formatScore(row.freshness), 6),
      formatCell(formatScore(row.interestScore, 0), 5),
      formatCell(formatScore(row.coverage, 2), 5),
      formatCell(formatScore(row.crossSource, 2), 6),
      formatCell(formatScore(row.corroboration, 2), 5),
      formatCell(formatScore(row.recommended), 5),
      formatCell(row.title || '', 60)
    ].join('  '));
  }

  return rows;
}
