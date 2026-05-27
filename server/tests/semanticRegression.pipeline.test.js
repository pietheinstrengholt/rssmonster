import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Op } from 'sequelize';

import db from '../models/index.js';
import { reclusterForUser } from '../services/events/reclusterForUser.js';
import { buildInterestIslandsForUser } from '../services/islands/buildInterestIslands.js';

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
  IslandTaxonomy
} = db;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression.json');
const VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'semantic-regression.vectors.json');
const TAXONOMY_VECTOR_FIXTURE_PATH = join(__dirname, 'fixtures', 'island-taxonomy.vectors.json');
const FIXTURE_USERNAME = 'semantic-regression-user';
const EXPECTED_MIN_EVENTS = 10;
const EXPECTED_MIN_TOPICS = 5;
const EXPECTED_MIN_ISLANDS = 2;
const EXPECTED_MIN_ASSIGNED_ARTICLES = 25;
const EXPECTED_MIN_TOPIC_LINKED_ARTICLES = 15;
const EXPECTED_MIN_ARTICLE_TOPIC_LINKS = 15;
const SEMANTIC_FIXTURE_ISLAND_TOPIC_CONFIDENCE_THRESHOLD = 0.02;
const REPORT_SEPARATOR = '-'.repeat(96);
const MAX_REPORTED_ARTICLES_PER_EVENT = 12;

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

function eventArticleCount(event) {
  if (Array.isArray(event.articles)) {
    return event.articles.length;
  }

  return Number(event.articleCount || 0);
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

async function printSemanticPipelineReport(userId) {
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
  const islandTopicCounts = islandTopicRows.reduce((counts, row) => {
    const key = String(row.islandId);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

  const [topicRows, articleTopicRows, eventTopicRows] = await Promise.all([
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
    })
  ]);

  const islandById = new Map(
    islands.map(island => [String(island.id), island])
  );

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
    `${formatCell('Topics', 8)} ` +
    `${formatCell('Events', 8)} ` +
    `${formatCell('Articles', 10)} ` +
    'Island'
  );
  reportLine(REPORT_SEPARATOR);

  for (const island of islands) {
    const islandKey = String(island.id);

    reportLine(
      `${formatCell(island.id, 6)} ` +
      `${formatCell(islandTopicCounts.get(islandKey) || 0, 8)} ` +
      `${formatCell(eventIdsByIslandId.get(islandKey)?.size || 0, 8)} ` +
      `${formatCell(articleIdsByIslandId.get(islandKey)?.size || 0, 10)} ` +
      `${island.label}`
    );
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

describe('semantic regression fixture pipeline', () => {
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
      .map((article, index) => ({
        index,
        contentHash: hashContent(article.content),
        preview: article.content.slice(0, 160)
      }))
      .filter(article => !vectorByContentHash.has(article.contentHash));

    expect(
      missingVectorArticles,
      JSON.stringify(missingVectorArticles, null, 2)
    ).toHaveLength(0);

    const user = await User.create({
      username: FIXTURE_USERNAME,
      password: 'rssmonster',
      hash: 'rssmonster',
      role: 'user'
    });

    const category = await Category.create({
      userId: user.id,
      name: 'Semantic Regression'
    });

    const feedIdMap = new Map();
    for (const fixtureFeed of fixture.feeds) {
      const feed = await Feed.create({
        userId: user.id,
        categoryId: category.id,
        feedName: fixtureFeed.feedName,
        feedDesc: fixtureFeed.feedDesc || fixtureFeed.description,
        feedType: fixtureFeed.feedType || 'rss',
        url: fixtureFeed.url,
        status: fixtureFeed.status || 'active'
      });

      feedIdMap.set(fixtureFeed.id, feed.id);
    }

    const now = Date.now();
    const articles = fixture.articles.map((fixtureArticle, index) => {
      const contentHash = hashContent(fixtureArticle.content);
      const published = new Date(now - (fixture.articles.length - index) * 5 * 60 * 1000);

      return {
        userId: user.id,
        feedId: feedIdMap.get(fixtureArticle.feedId),
        status: fixtureArticle.status,
        starInd: fixtureArticle.starInd,
        negativeInd: fixtureArticle.negativeInd,
        clickedAmount: fixtureArticle.clickedAmount,
        url: `https://fixtures.rssmonster.test/semantic/${index + 1}`,
        title: titleFromContent(fixtureArticle.content, index),
        description: fixtureArticle.content.slice(0, 500),
        contentOriginal: fixtureArticle.content,
        contentStripped: fixtureArticle.content,
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
    await printSemanticPipelineReport(user.id);

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
      islandTopicLinkCount
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
  }, 60000);
});
