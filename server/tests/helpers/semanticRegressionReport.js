
import db from '../../models/index.js';
import { cosineSimilarity } from '../../services/vectors/index.js';
import { computeRecommended, computeRecommendedBreakdown } from '../../services/recommendations/recommendedScore.js';

const {
  User,
  Article,
  Event,
  Feed,
  Tag,
  Island
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

// Loads current Island vectors for the compact diagnostic overview.
async function buildIslandLookups(userId) {
  try {
    return { islands: await Island.findAll({ where: { userId, archivedInd: false },
      attributes: ['id', 'label', 'weight', 'islandVector'], raw: true }) };
  } catch (error) {
    if (isMissingTableError(error)) return { islands: [] };
    throw error;
  }
}

// This function resolves an island label from direct vector affinity.
function resolveIslandName(article, islands) {
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
  const { islands } = includeIslands
    ? await buildIslandLookups(userId)
    : { islands: [] };
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
      const eventName = compactLabel(event?.name);
      const islandName = resolveIslandName(article, islands);
      const hasSemanticLink = eventName !== '-' || islandName !== '-';

      if (!hasSemanticLink) return null;

      const breakdown = computeRecommendedBreakdown(article);
      const recommended = computeRecommended(article);

      return {
        ID: Number(article.id),
        New: newArticleIdSet.has(Number(article.id)) ? '*' : '',
        Event: eventName,
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
  if (process.env.SEMANTIC_REPORT_LEVEL !== 'trace') return rows;

  const columns = [
    ['ID', 5],
    ['New', 4],
    ['Event', 20],
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
