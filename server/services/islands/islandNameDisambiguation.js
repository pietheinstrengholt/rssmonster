import { Op } from 'sequelize';
import db from '../../models/index.js';
import { cosineSimilarity } from './islandVectorUtils.js';

const { Island, IslandTopic } = db;

export const ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD || '0.92'
);

const MAX_ISLAND_NAME_LENGTH = 90;
const GENERIC_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'its',
  'new',
  'news',
  'of',
  'on',
  'or',
  'over',
  'the',
  'this',
  'to',
  'what',
  'when',
  'where',
  'why',
  'with',
  'without',
  'your'
]);

// This function normalizes island names for duplicate-name matching.
export function normalizeIslandName(name = '') {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function groups island rows by normalized label.
export function groupIslandsByNormalizedName(islands = []) {
  const groups = new Map();

  for (const island of islands) {
    const normalizedName = normalizeIslandName(island.label);
    if (!normalizedName) continue;

    const group = groups.get(normalizedName) || [];
    group.push(island);
    groups.set(normalizedName, group);
  }

  return groups;
}

// This function extracts the most recent audited source article count from one island.
export function sourceArticleCountForIsland(island) {
  const audit = Array.isArray(island?.populationAudit) ? island.populationAudit : [];
  const latest = audit[audit.length - 1] || null;
  const relatedCount = latest?.metrics?.relatedArticleCount;
  if (Number.isFinite(Number(relatedCount))) return Number(relatedCount);

  const sourceArticles = latest?.sourceArticles?.articles;
  if (Array.isArray(sourceArticles)) return sourceArticles.length;

  return 0;
}

// This function orders duplicate-name islands by deterministic semantic strength.
export function compareIslandStrength(left, right, topicCountByIslandId = new Map()) {
  const leftTopicCount = topicCountByIslandId.get(Number(left.id)) || 0;
  const rightTopicCount = topicCountByIslandId.get(Number(right.id)) || 0;
  const leftArticleCount = sourceArticleCountForIsland(left);
  const rightArticleCount = sourceArticleCountForIsland(right);

  return (
    rightTopicCount - leftTopicCount ||
    rightArticleCount - leftArticleCount ||
    Math.abs(Number(right.weight || 0)) - Math.abs(Number(left.weight || 0)) ||
    Number(left.id || 0) - Number(right.id || 0)
  );
}

// This function returns the strongest island from a same-name group.
export function strongestIslandForDuplicateNameGroup(islands = [], topicCountByIslandId = new Map()) {
  return islands.slice().sort((a, b) => compareIslandStrength(a, b, topicCountByIslandId))[0] || null;
}

// This function checks whether two same-name islands are near-duplicate vectors.
export function isNearDuplicateIslandName(left, right, threshold = ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD) {
  if (normalizeIslandName(left?.label) !== normalizeIslandName(right?.label)) return false;

  const similarity = cosineSimilarity(left?.islandVector, right?.islandVector, {
    coerceNumbers: true
  });

  return similarity >= threshold;
}

// This function title-cases a compact suffix phrase.
function titleCasePhrase(phrase) {
  return String(phrase || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.length <= 3 && word.toUpperCase() === word
      ? word
      : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');
}

// This function removes filler and base-name words from a suffix candidate.
function cleanSuffixCandidate(candidate, baseName) {
  const baseWords = new Set(normalizeIslandName(baseName).split(/\s+/).filter(Boolean));
  const words = String(candidate || '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(word => {
      const normalized = normalizeIslandName(word);
      if (!normalized || normalized.length < 3) return false;
      if (GENERIC_WORDS.has(normalized)) return false;
      if (baseWords.has(normalized)) return false;
      return true;
    })
    .slice(0, 4);

  return titleCasePhrase(words.join(' '));
}

// This function extracts capitalized entity-like phrases from source text.
function entityPhrasesFromText(text = '') {
  const matches = String(text || '').match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3}\b/g) || [];
  return matches
    .map(match => match.trim())
    .filter(match => match.length >= 3);
}

// This function returns source article titles from the latest island audit entry.
function sourceArticleTitlesForIsland(island) {
  const audit = Array.isArray(island?.populationAudit) ? island.populationAudit : [];
  const latest = audit[audit.length - 1] || null;
  const sourceArticles = latest?.sourceArticles?.articles;
  if (!Array.isArray(sourceArticles)) return [];

  return sourceArticles
    .map(article => article?.title)
    .filter(Boolean);
}

// This function collects topic names linked to each island.
async function topicNamesByIslandId(islandIds, transaction) {
  if (!islandIds.length) return new Map();

  const rows = await db.sequelize.query(
    `
      SELECT islandTopic.islandId, topic.name
      FROM island_topics AS islandTopic
      INNER JOIN topics AS topic
        ON topic.id = islandTopic.topicId
      WHERE islandTopic.islandId IN (:islandIds)
      ORDER BY islandTopic.confidence DESC, islandTopic.similarity DESC, islandTopic.topicId ASC
    `,
    {
      replacements: { islandIds },
      type: db.Sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  const namesByIslandId = new Map();

  for (const row of rows) {
    const islandId = Number(row.islandId);
    const names = namesByIslandId.get(islandId) || [];
    const name = row.name;
    if (name) names.push(name);
    namesByIslandId.set(islandId, names);
  }

  return namesByIslandId;
}

// This function counts linked topics for each island.
async function topicCountByIslandId(islandIds, transaction) {
  if (!islandIds.length) return new Map();

  const rows = await IslandTopic.findAll({
    where: { islandId: { [Op.in]: islandIds } },
    attributes: [
      'islandId',
      [db.sequelize.fn('COUNT', db.sequelize.col('topicId')), 'topicCount']
    ],
    group: ['islandId'],
    raw: true,
    transaction
  });

  return new Map(
    rows.map(row => [Number(row.islandId), Number(row.topicCount || 0)])
  );
}

// This function builds suffix candidates from article titles, topic names, and entity-like phrases.
function suffixCandidatesForIsland(island, topicNames = []) {
  const titles = sourceArticleTitlesForIsland(island);
  const entities = titles.flatMap(title => entityPhrasesFromText(title));

  return [
    ...titles,
    ...topicNames,
    ...entities,
    'Variant'
  ];
}

// This function creates a compact disambiguated island name.
export function buildDisambiguatedIslandName(baseName, island, topicNames = [], usedNames = new Set()) {
  for (const candidate of suffixCandidatesForIsland(island, topicNames)) {
    const suffix = cleanSuffixCandidate(candidate, baseName);
    if (!suffix) continue;

    const nextName = `${baseName}: ${suffix}`.slice(0, MAX_ISLAND_NAME_LENGTH);
    const normalized = normalizeIslandName(nextName);
    if (!usedNames.has(normalized)) return nextName;
  }

  return `${baseName}: Variant ${island.id}`.slice(0, MAX_ISLAND_NAME_LENGTH);
}

// This function writes the required concise disambiguation log line.
function logIslandRename({ island, from, to, strongerIsland, similarity }) {
  console.log(
    `[ISLAND] renamed island=${island.id} ` +
    `from="${String(from || '').replace(/"/g, '\\"')}" ` +
    `to="${String(to || '').replace(/"/g, '\\"')}" ` +
    `reason=duplicate-name-low-sim stronger=${strongerIsland.id} ` +
    `sim=${Number(similarity || 0).toFixed(3)}`
  );
}

// This function disambiguates active same-name islands after calibration persistence.
export async function disambiguateDuplicateIslandNamesForUser(userId, options = {}) {
  const { transaction } = options;
  const activeIslands = await Island.findAll({
    where: {
      userId,
      archivedInd: false
    },
    order: [['id', 'ASC']],
    transaction
  });
  const islandIds = activeIslands.map(island => Number(island.id));
  const topicsByIslandId = await topicNamesByIslandId(islandIds, transaction);
  const topicCounts = await topicCountByIslandId(islandIds, transaction);
  const groups = groupIslandsByNormalizedName(activeIslands);
  const usedNames = new Set(activeIslands.map(island => normalizeIslandName(island.label)));
  const renamed = [];
  const archived = [];

  for (const islands of groups.values()) {
    if (islands.length <= 1) continue;

    const strongest = strongestIslandForDuplicateNameGroup(islands, topicCounts);
    const ranked = islands.slice().sort((a, b) => compareIslandStrength(a, b, topicCounts));
    const baseName = strongest.label;

    for (const island of ranked.slice(1)) {
      const similarity = cosineSimilarity(island.islandVector, strongest.islandVector, {
        coerceNumbers: true
      });

      if (similarity >= ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD) {
        await island.update({
          archivedInd: true,
          archivedAt: new Date()
        }, { transaction });
        archived.push(Number(island.id));
        continue;
      }

      usedNames.delete(normalizeIslandName(island.label));
      const nextName = buildDisambiguatedIslandName(
        baseName,
        island,
        topicsByIslandId.get(Number(island.id)) || [],
        usedNames
      );
      usedNames.add(normalizeIslandName(nextName));

      if (nextName === island.label) continue;

      const previousName = island.label;
      await island.update({ label: nextName }, { transaction });
      logIslandRename({
        island,
        from: previousName,
        to: nextName,
        strongerIsland: strongest,
        similarity
      });
      renamed.push({
        islandId: Number(island.id),
        from: previousName,
        to: nextName,
        strongerIslandId: Number(strongest.id),
        similarity
      });
    }
  }

  return {
    renamed,
    archived
  };
}

export default disambiguateDuplicateIslandNamesForUser;
