import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';

import db from '../models/index.js';
import { incrementalClusterForUser, reclusterForUser } from '../services/events/reclusterForUser.js';
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
const BASELINE_FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression.json');
const BASELINE_VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression.vectors.json');
const INCREMENTAL_FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression-incremental.json');
const INCREMENTAL_VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression-incremental.vectors.json');
const TAXONOMY_VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'island-taxonomy.vectors.json');
const FIXTURE_USERNAME = 'semantic-regression-user';
const FIXTURE_PASSWORD = 'rssmonster';
const EXPECTED_INCREMENTAL_ARTICLE_COUNT = 77;
const SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD = 0.02;
const MIN_STRONG_EVENT_STRENGTH = 0.35;
const RECOMMENDED_DEBUG_FORMULA =
  '0.20*freshness + 0.22*interest + 0.10*quality + 0.22*coverage + ' +
  '0.13*crossSource + 0.13*corroboration + eventBoost + ruleBoost';

let semanticRegressionUserId = null;

// This function loads a JSON fixture from disk.
async function loadFixture(path) {
  const fixtureText = await readFile(path, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

// This function loads a vector fixture and emits an actionable error when it is missing.
async function loadVectorFixture(path, remediation) {
  try {
    return await loadFixture(path);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Missing vector fixture ${path}. ${remediation}`);
    }

    throw err;
  }
}

// This function hashes article content using the same stable key as the vector fixtures.
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// This function maps content hashes to stored embedding vectors.
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

// This function picks the content field used by semantic vector fixtures.
function articleContent(fixtureArticle) {
  return (
    fixtureArticle.contentStripped ||
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

  return firstSentence?.slice(0, 180) || `Semantic fixture article ${articleIndex + 1}`;
}

// This function parses fixture dates with a deterministic fallback.
function articlePublished(fixtureArticle, fallbackPublished) {
  if (!fixtureArticle.published) return fallbackPublished;

  const published = new Date(fixtureArticle.published);
  return Number.isNaN(published.getTime()) ? fallbackPublished : published;
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

// This function prints a compact table without the default console row index.
function printDebugTable(rows, columns) {
  const widths = columns.map(column => {
    const values = rows.map(row => String(row[column] ?? ''));
    return Math.max(column.length, ...values.map(value => value.length));
  });

  const separator = `+${widths.map(width => '-'.repeat(width + 2)).join('+')}+`;
  const formatRow = values =>
    `| ${values.map((value, index) => String(value ?? '').padEnd(widths[index], ' ')).join(' | ')} |`;

  console.log(separator);
  console.log(formatRow(columns));
  console.log(separator);
  for (const row of rows) {
    console.log(formatRow(columns.map(column => row[column])));
  }
  console.log(separator);
}

// This function shortens event names for compact debug tables.
function compactEventName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

// This function creates the regression user when the baseline test has not already done so.
async function findOrCreateRegressionUser() {
  const existingUser = await User.findOne({ where: { username: FIXTURE_USERNAME } });
  if (existingUser) return existingUser;

  const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  const apiHash = crypto.createHash('md5')
    .update(`${FIXTURE_USERNAME}:${FIXTURE_PASSWORD}`)
    .digest('hex');

  return User.create({
    username: FIXTURE_USERNAME,
    password: passwordHash,
    hash: apiHash,
    role: 'user'
  });
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

// This function inserts any fixture articles that are not already present by content hash.
async function insertMissingFixtureArticles(userId, fixture, vectorByContentHash, urlPrefix) {
  const categoryIdMap = await ensureFixtureCategories(userId, fixture.categories);
  const feedIdMap = await ensureFixtureFeeds(userId, fixture.feeds, categoryIdMap);
  const now = Date.now();
  let insertedCount = 0;

  for (const [index, fixtureArticle] of fixture.articles.entries()) {
    const content = articleContent(fixtureArticle);
    const contentHash = hashContent(content);
    const existingArticle = await Article.findOne({
      where: {
        userId,
        contentHash
      },
      attributes: ['id']
    });

    if (existingArticle) continue;

    const vectorRecord = vectorByContentHash.get(contentHash);
    if (!vectorRecord?.articleVector?.length) {
      throw new Error(`Missing semantic vector for fixture article ${contentHash}`);
    }

    const fallbackPublished = new Date(now - (fixture.articles.length - index) * 5 * 60 * 1000);
    const published = articlePublished(fixtureArticle, fallbackPublished);

    await Article.create({
      userId,
      feedId: feedIdMap.get(fixtureArticle.feedId),
      status: fixtureArticle.status || 'unread',
      starInd: fixtureArticle.starInd || 0,
      negativeInd: fixtureArticle.negativeInd || 0,
      clickedAmount: fixtureArticle.clickedAmount || 0,
      url: fixtureArticle.url || `${urlPrefix}/${index + 1}`,
      title: articleTitle(fixtureArticle, index),
      description: fixtureArticle.description || content.slice(0, 500),
      contentOriginal: fixtureArticle.contentOriginal || content,
      contentStripped: fixtureArticle.contentStripped || content,
      contentHash,
      articleVector: vectorRecord.articleVector,
      embedding_model: vectorRecord.embeddingModel,
      published,
      firstSeen: fixtureArticle.firstSeen ? new Date(fixtureArticle.firstSeen) : published
    });

    insertedCount++;
  }

  return insertedCount;
}

// This function seeds the baseline fixture only when the semantic regression user has no loaded content.
async function ensureBaselineContent(userId) {
  const existingArticleCount = await Article.count({ where: { userId } });
  if (existingArticleCount > 0) return { seeded: false, articleCount: existingArticleCount };

  const baselineFixture = await loadFixture(BASELINE_FIXTURE_PATH);
  const baselineVectorFixture = await loadVectorFixture(
    BASELINE_VECTOR_FIXTURE_PATH,
    'Run `npm run fixture:semantic-vectors` in server/ before this test.'
  );
  const baselineVectorByContentHash = buildVectorMap(baselineVectorFixture);
  const insertedCount = await insertMissingFixtureArticles(
    userId,
    baselineFixture,
    baselineVectorByContentHash,
    'https://fixtures.rssmonster.test/semantic'
  );

  await reclusterForUser(userId);

  return { seeded: true, articleCount: insertedCount };
}

// This function loads taxonomy rows needed to enrich interest islands from topics.
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

// This function formats recommended-score rows for incremental article debugging.
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

// This function prints recommended-score debug rows for the 77 incremental articles.
async function printIncrementalRecommendedDebug(userId, incrementalArticleIds) {
  const articles = await Article.findAll({
    where: {
      userId,
      id: { [Op.in]: incrementalArticleIds }
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
    attributes: ['id', 'label', 'weight'],
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
  const rows = recommendedDebugRows(articles, islandByTopicId);

  console.log(`[SEMANTIC INCREMENTAL RECOMMENDED DEBUG] Formula: ${RECOMMENDED_DEBUG_FORMULA}`);
  console.log(
    `[SEMANTIC INCREMENTAL RECOMMENDED DEBUG] articles=${articles.length} ` +
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

// This function prints compact debug data for the incremental pipeline assertions.
async function printIncrementalDebugReport({
  userId,
  incrementalArticleIds,
  insertedCount,
  baselineArticleCount,
  baselineEventCount,
  baselineTopicCount,
  baselineIslandCount,
  baselineIslandTopicLinkCount,
  taxonomyCount,
  islandResult
}) {
  const [
    finalArticleCount,
    finalEventCount,
    finalTopicCount,
    finalIslandCount,
    finalIslandTopicLinkCount,
    assignedIncrementalArticleCount,
    topicLinkedIncrementalArticleCount,
    scoredIncrementalArticleCount,
    topIncrementalArticles,
    islands
  ] = await Promise.all([
    Article.count({ where: { userId } }),
    Event.count({ where: { userId } }),
    Topic.count({ where: { userId } }),
    Island.count({ where: { userId } }),
    IslandTopic.count({
      include: [{
        model: Island,
        required: true,
        attributes: [],
        where: { userId }
      }]
    }),
    Article.count({
      where: {
        id: { [Op.in]: incrementalArticleIds },
        eventId: { [Op.ne]: null }
      }
    }),
    Article.count({
      where: {
        id: { [Op.in]: incrementalArticleIds },
        topicId: { [Op.ne]: null }
      }
    }),
    Article.count({
      where: {
        id: { [Op.in]: incrementalArticleIds },
        interestScore: { [Op.ne]: 0 }
      }
    }),
    Article.findAll({
      where: {
        id: { [Op.in]: incrementalArticleIds }
      },
      include: [{
        model: Event,
        as: 'event',
        required: false,
        attributes: ['id', 'name', 'articleCount', 'sourceCount', 'eventStrength', 'status']
      }],
      attributes: ['id', 'title', 'eventId', 'topicId', 'interestScore'],
      order: [
        ['interestScore', 'DESC'],
        ['id', 'ASC']
      ],
      limit: 12
    }),
    Island.findAll({
      where: { userId },
      attributes: ['id', 'label', 'weight'],
      order: [
        ['weight', 'DESC'],
        ['id', 'ASC']
      ],
      limit: 10,
      raw: true
    })
  ]);

  console.log('[SEMANTIC INCREMENTAL DEBUG] summary');
  console.table([{
    insertedCount,
    baselineArticleCount,
    finalArticleCount,
    baselineEventCount,
    finalEventCount,
    baselineTopicCount,
    finalTopicCount,
    baselineIslandCount,
    finalIslandCount,
    baselineIslandTopicLinkCount,
    finalIslandTopicLinkCount,
    taxonomyCount,
    assignedIncrementalArticleCount,
    topicLinkedIncrementalArticleCount,
    scoredIncrementalArticleCount
  }]);

  console.log('[SEMANTIC INCREMENTAL DEBUG] island build result');
  console.table([{
    islandCount: islandResult.islandCount,
    enrichedIslandCount: islandResult.enrichedIslandCount,
    islandTopicLinkCount: islandResult.islandTopicLinkCount,
    topicScoredCount: islandResult.topicScoredCount,
    fallbackScoredCount: islandResult.fallbackScoredCount,
    rescoredArticleCount: islandResult.rescoredArticleCount
  }]);

  console.log('[SEMANTIC INCREMENTAL DEBUG] top scored incremental articles');
  console.table(topIncrementalArticles.map(article => ({
    articleId: article.id,
    eventId: article.eventId,
    topicId: article.topicId,
    interestScore: Number(Number(article.interestScore || 0).toFixed(4)),
    eventArticles: article.event?.articleCount || 0,
    eventStrength: Number(Number(article.event?.eventStrength || 0).toFixed(4)),
    eventSources: article.event?.sourceCount || 0,
    eventStatus: article.event?.status || null,
    title: article.title
  })));

  console.log('[SEMANTIC INCREMENTAL DEBUG] islands');
  console.table(islands.map(island => ({
    islandId: island.id,
    weight: Number(Number(island.weight || 0).toFixed(4)),
    label: island.label
  })));
}

describe('semantic regression incremental pipeline', () => {
  beforeAll(async () => {
    await sequelize.authenticate();

    const user = await findOrCreateRegressionUser();
    const taxonomyVectorFixture = await loadVectorFixture(
      TAXONOMY_VECTOR_FIXTURE_PATH,
      'Run `npm run fixture:taxonomy-vectors` in server/ before this test.'
    );

    semanticRegressionUserId = user.id;
    await ensureBaselineContent(user.id);

    const taxonomyCount = await loadIslandTaxonomyFixture(taxonomyVectorFixture);
    const baselineIslandResult = await buildInterestIslandsForUser(user.id, {
      topicConfidenceThreshold: SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD
    });

    console.log('[SEMANTIC INCREMENTAL DEBUG] baseline full pipeline result');
    console.table([{
      taxonomyCount,
      islandCount: baselineIslandResult.islandCount,
      enrichedIslandCount: baselineIslandResult.enrichedIslandCount,
      islandTopicLinkCount: baselineIslandResult.islandTopicLinkCount,
      topicScoredCount: baselineIslandResult.topicScoredCount,
      fallbackScoredCount: baselineIslandResult.fallbackScoredCount,
      rescoredArticleCount: baselineIslandResult.rescoredArticleCount
    }]);
  }, 60000);

  it('loads unread incremental fixture content without replaying existing clusters', async () => {
    const userId = semanticRegressionUserId;
    const incrementalFixture = await loadFixture(INCREMENTAL_FIXTURE_PATH);
    const incrementalVectorFixture = await loadVectorFixture(
      INCREMENTAL_VECTOR_FIXTURE_PATH,
      'Run `npm run fixture:semantic-incremental-vectors` in server/ before this test.'
    );
    const taxonomyVectorFixture = await loadVectorFixture(
      TAXONOMY_VECTOR_FIXTURE_PATH,
      'Run `npm run fixture:taxonomy-vectors` in server/ before this test.'
    );
    const incrementalVectorByContentHash = buildVectorMap(incrementalVectorFixture);

    expect(incrementalFixture.articles).toHaveLength(EXPECTED_INCREMENTAL_ARTICLE_COUNT);
    expect(taxonomyVectorFixture.taxonomy.length).toBeGreaterThan(0);

    const baselineArticleCount = await Article.count({ where: { userId } });
    const baselineEventCount = await Event.count({ where: { userId } });
    const baselineTopicCount = await Topic.count({ where: { userId } });
    const baselineIslandCount = await Island.count({ where: { userId } });
    const baselineIslandTopicLinkCount = await IslandTopic.count({
      include: [{
        model: Island,
        required: true,
        attributes: [],
        where: { userId }
      }]
    });
    const baselineAssignments = await Article.findAll({
      where: { userId },
      attributes: ['id', 'eventId'],
      raw: true
    });
    const baselineEventIdByArticleId = new Map(
      baselineAssignments.map(article => [Number(article.id), article.eventId])
    );

    const insertedCount = await insertMissingFixtureArticles(
      userId,
      incrementalFixture,
      incrementalVectorByContentHash,
      'https://fixtures.rssmonster.test/semantic-incremental'
    );
    const incrementalContentHashes = incrementalFixture.articles
      .map(article => hashContent(articleContent(article)));

    expect(insertedCount).toBeGreaterThan(0);
    expect(insertedCount).toBeLessThanOrEqual(EXPECTED_INCREMENTAL_ARTICLE_COUNT);

    const incrementalArticleRows = await Article.findAll({
      where: {
        userId,
        contentHash: { [Op.in]: incrementalContentHashes }
      },
      attributes: ['id'],
      raw: true
    });
    const incrementalArticleIds = incrementalArticleRows.map(article => article.id);

    expect(incrementalArticleIds).toHaveLength(EXPECTED_INCREMENTAL_ARTICLE_COUNT);

    const preClusteredIncrementalCount = await Article.count({
      where: {
        id: { [Op.in]: incrementalArticleIds },
        eventId: { [Op.ne]: null }
      }
    });

    expect(preClusteredIncrementalCount).toBe(0);

    await incrementalClusterForUser(userId);
    const taxonomyCount = await loadIslandTaxonomyFixture(taxonomyVectorFixture);
    const islandResult = await buildInterestIslandsForUser(userId, {
      topicConfidenceThreshold: SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD
    });

    const [
      finalArticleCount,
      finalEventCount,
      finalTopicCount,
      finalIslandCount,
      finalIslandTopicLinkCount,
      assignedIncrementalArticleCount,
      scoredIncrementalArticleCount,
      linkedIncrementalArticleTopicCount,
      linkedIncrementalEventTopicCount,
      preservedBaselineAssignments
    ] = await Promise.all([
      Article.count({ where: { userId } }),
      Event.count({ where: { userId } }),
      Topic.count({ where: { userId } }),
      Island.count({ where: { userId } }),
      IslandTopic.count({
        include: [{
          model: Island,
          required: true,
          attributes: [],
          where: { userId }
        }]
      }),
      Article.count({
        where: {
          id: { [Op.in]: incrementalArticleIds },
          eventId: { [Op.ne]: null }
        }
      }),
      Article.count({
        where: {
          id: { [Op.in]: incrementalArticleIds },
          interestScore: { [Op.ne]: 0 }
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

    await printIncrementalDebugReport({
      userId,
      incrementalArticleIds,
      insertedCount,
      baselineArticleCount,
      baselineEventCount,
      baselineTopicCount,
      baselineIslandCount,
      baselineIslandTopicLinkCount,
      taxonomyCount,
      islandResult
    });
    const recommendedRows = await printIncrementalRecommendedDebug(userId, incrementalArticleIds);

    expect(taxonomyCount).toBeGreaterThan(0);
    expect(finalArticleCount).toBe(baselineArticleCount + insertedCount);
    expect(finalEventCount).toBeGreaterThanOrEqual(baselineEventCount);
    expect(finalTopicCount).toBeGreaterThanOrEqual(baselineTopicCount);
    expect(islandResult.islandCount).toBeGreaterThan(0);
    expect(islandResult.enrichedIslandCount).toBeGreaterThan(0);
    expect(islandResult.islandTopicLinkCount).toBeGreaterThan(0);
    expect(finalIslandCount).toBeGreaterThan(0);
    expect(finalIslandTopicLinkCount).toBeGreaterThan(0);
    expect(preservedBaselineAssignments).toHaveLength(baselineEventIdByArticleId.size);

    for (const article of preservedBaselineAssignments) {
      expect(article.eventId).toBe(baselineEventIdByArticleId.get(Number(article.id)));
    }

    expect(assignedIncrementalArticleCount).toBeGreaterThan(0);
    expect(incrementalEvents.length).toBeGreaterThan(0);

    for (const event of incrementalEvents) {
      expect(Number(event.articleCount || 0)).toBeGreaterThan(0);
      expect(Number(event.sourceCount || 0)).toBeGreaterThan(0);
      expect(event.status).toBeTruthy();
      expect(Number(event.eventStrength || 0)).toBeGreaterThanOrEqual(MIN_STRONG_EVENT_STRENGTH);
    }

    expect(scoredIncrementalArticleCount).toBeGreaterThan(0);
    expect(linkedIncrementalArticleTopicCount).toBeGreaterThan(0);
    expect(linkedIncrementalEventTopicCount).toBeGreaterThan(0);
    expect(recommendedRows).toHaveLength(EXPECTED_INCREMENTAL_ARTICLE_COUNT);
    expect(recommendedRows[0].recommended).toBeGreaterThanOrEqual(recommendedRows.at(-1).recommended);
  }, 60000);
});
