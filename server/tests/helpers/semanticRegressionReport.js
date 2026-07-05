import { Op } from 'sequelize';

import db from '../../models/index.js';
import { cosineSimilarity } from '../../services/vectors/index.js';
import { computeRecommended, computeRecommendedBreakdown } from '../../util/recommendedScore.js';

const {
  User,
  Article,
  Event,
  Topic,
  Feed,
  Tag,
  Island,
  IslandTopic
} = db;

const DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_ARTICLE_SCORE_THRESHOLD || '0.62'
);

// This function checks whether an error came from a missing optional semantic table.
function isMissingTableError(err) {
  return err?.original?.code === 'ER_NO_SUCH_TABLE' || err?.parent?.code === 'ER_NO_SUCH_TABLE';
}

// This function shortens semantic labels for compact report rows.
function compactLabel(name) {
  if (!name || typeof name !== 'string') return '-';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ') || '-';
}

// This function formats a compact fixed-width cell.
function formatCell(value, width) {
  const text = String(value ?? '');
  if (text.length > width) return text.slice(0, width - 1);

  return text.padEnd(width, ' ');
}

// This function formats scores like the semantic regression overview.
function formatScore(value, digits) {
  const numeric = Number(value || 0);
  if (digits === 0) return String(Math.round(numeric));

  return numeric.toFixed(digits);
}

// This function maps topic IDs to the strongest island that contains them.
async function buildIslandLookups(userId) {
  let islands = [];
  let islandTopicRows = [];

  try {
    islands = await Island.findAll({
      where: { userId, archivedInd: false },
      attributes: ['id', 'label', 'weight', 'islandVector'],
      raw: true
    });
    islandTopicRows = islands.length
      ? await IslandTopic.findAll({
        where: {
          islandId: { [Op.in]: islands.map(island => island.id) }
        },
        attributes: ['islandId', 'topicId'],
        raw: true
      })
      : [];
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }

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

// This function resolves an island label from direct topic membership or vector fallback scoring.
function resolveIslandName(article, islands, islandByTopicId) {
  const directIsland = islandByTopicId.get(String(article.topicId));
  if (directIsland?.label) return compactLabel(directIsland.label);

  if (!Number(article.interestScore || 0) || !article.articleVector) return '-';

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

  return compactLabel(strongestIsland?.label);
}

// This function builds rows for the shared semantic regression article overview.
export async function semanticArticleRankingRows(userId, options = {}) {
  const { newArticleIds = [], limit = null, includeIslands = true } = options;
  const newArticleIdSet = new Set(newArticleIds.map(Number));
  const { islands, islandByTopicId } = includeIslands
    ? await buildIslandLookups(userId)
    : { islands: [], islandByTopicId: new Map() };
  let articles = [];

  try {
    articles = await Article.findAll({
      where: { userId },
      include: [
        {
          model: Event,
          as: 'event',
          attributes: ['id', 'name', 'articleCount', 'sourceDiversityScore', 'sourceCount'],
          required: false,
          include: [{
            model: Topic,
            as: 'primaryTopic',
            attributes: ['id', 'name'],
            required: false
          }]
        },
        {
          model: Topic,
          as: 'topic',
          attributes: ['id', 'name'],
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
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }

  const rows = articles
    .map(article => {
      article.Tags = article.get?.('tags') ?? article.tags ?? article.Tags ?? [];

      const event = article.get?.('event') ?? article.event ?? null;
      const topic = article.get?.('topic') ?? article.topic ?? event?.primaryTopic ?? null;
      const eventName = compactLabel(event?.name);
      const topicName = compactLabel(topic?.name);
      const islandName = resolveIslandName(article, islands, islandByTopicId);
      const hasSemanticLink = eventName !== '-' || topicName !== '-' || islandName !== '-';

      if (!hasSemanticLink) return null;

      const breakdown = computeRecommendedBreakdown(article);
      const recommended = computeRecommended(article);

      return {
        ID: Number(article.id),
        New: newArticleIdSet.has(Number(article.id)) ? '*' : '',
        Event: eventName,
        Topic: topicName,
        Island: islandName,
        Fresh: Number(breakdown.freshness || 0),
        Int: Number(article.interestScore || 0),
        Cov: Number(breakdown.coverage || 0),
        Cross: Number(breakdown.crossSource || 0),
        Corr: Number(breakdown.corroboration || 0),
        Rec: Number(recommended || 0)
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.Rec - left.Rec ||
      left.ID - right.ID
    ));

  return Number.isInteger(limit) ? rows.slice(0, limit) : rows;
}

// This function prints the shared semantic regression article overview.
export async function printSemanticArticleRankingTable(userId, options = {}) {
  if (!userId) return [];

  const rows = await semanticArticleRankingRows(userId, options);
  const columns = [
    ['ID', 5],
    ['New', 4],
    ['Event', 20],
    ['Topic', 20],
    ['Island', 20],
    ['Fresh', 6],
    ['Int.', 5],
    ['Cov.', 5],
    ['Cross', 6],
    ['Corr', 5],
    ['Rec.', 5]
  ];

  console.log(columns.map(([label, width]) => formatCell(label, width)).join('  '));

  for (const row of rows) {
    console.log([
      formatCell(row.ID, 5),
      formatCell(row.New, 4),
      formatCell(row.Event, 20),
      formatCell(row.Topic, 20),
      formatCell(row.Island, 20),
      formatCell(formatScore(row.Fresh, 3), 6),
      formatCell(formatScore(row.Int, 0), 5),
      formatCell(formatScore(row.Cov, 2), 5),
      formatCell(formatScore(row.Cross, 2), 6),
      formatCell(formatScore(row.Corr, 2), 5),
      formatCell(formatScore(row.Rec, 3), 5)
    ].join('  '));
  }

  return rows;
}

// This function prints the shared semantic report for a regression username.
export async function printSemanticArticleRankingTableForUser(username, options = {}) {
  const user = await User.findOne({
    where: { username },
    attributes: ['id'],
    raw: true
  });

  if (!user) return [];

  return printSemanticArticleRankingTable(user.id, options);
}
