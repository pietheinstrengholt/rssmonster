import { Op } from 'sequelize';
import db from '../../models/index.js';
import { formatLogString } from '../../utils/logging.js';
import { cosineSimilarity } from './islandVectorUtils.js';

// Provides the shared dependencies used by this service.
const { Island, IslandTopic } = db;

// Defines the island duplicate name similarity threshold enforced by this service.
export const ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD || '0.92'
);

// Defines the max island name length enforced by this service.
const MAX_ISLAND_NAME_LENGTH = 90;
// Defines the max stored island name length enforced by this service.
const MAX_STORED_ISLAND_NAME_LENGTH = 255;
// Defines the generic words enforced by this service.
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

// This function appends a numeric suffix until an island name is unique.
export function buildUniqueIslandName(name, usedNames = new Set()) {
  // Derives the base name required while building unique island name.
  const baseName = String(name || '').trim() || 'Interest Island';
  // Derives the stored base name through slice while building unique island name.
  const storedBaseName = baseName.slice(0, MAX_STORED_ISLAND_NAME_LENGTH);
  // Returns early when used names does not contain normalize island name.
  if (!usedNames.has(normalizeIslandName(storedBaseName))) return storedBaseName;

  let suffixNumber = 2;

  // Repeats this processing step while eligible work remains.
  while (true) {
    // Derives the suffix required while building unique island name.
    const suffix = ` (${suffixNumber})`;
    // Derives the next name required while building unique island name.
    const nextName = `${baseName.slice(0, MAX_STORED_ISLAND_NAME_LENGTH - suffix.length)}${suffix}`;
    // Returns early when used names does not contain normalize island name.
    if (!usedNames.has(normalizeIslandName(nextName))) return nextName;
    suffixNumber += 1;
  }
}

// This function groups island rows by normalized label.
export function groupIslandsByNormalizedName(islands = []) {
  // Derives the groups required while performing group islands by normalized name.
  const groups = new Map();

  // Processes each islands entry in turn.
  for (const island of islands) {
    // Normalizes the name before performing group islands by normalized name.
    const normalizedName = normalizeIslandName(island.label);
    // Skips the current entry when normalized name is unavailable.
    if (!normalizedName) continue;

    // Derives the group required while performing group islands by normalized name.
    const group = groups.get(normalizedName) || [];
    group.push(island);
    groups.set(normalizedName, group);
  }

  return groups;
}

// This function extracts the most recent audited source article count from one island.
export function sourceArticleCountForIsland(island) {
  // Selects the audit based on whether population audit is an array.
  const audit = Array.isArray(island?.populationAudit) ? island.populationAudit : [];
  // Derives the latest required while performing source article count for island.
  const latest = audit[audit.length - 1] || null;
  const relatedCount = latest?.metrics?.relatedArticleCount;
  // Returns early when number is finite.
  if (Number.isFinite(Number(relatedCount))) return Number(relatedCount);

  const sourceArticles = latest?.sourceArticles?.articles;
  // Returns early when source articles is an array.
  if (Array.isArray(sourceArticles)) return sourceArticles.length;

  return 0;
}

// This function orders duplicate-name islands by deterministic semantic strength.
export function compareIslandStrength(left, right, topicCountByIslandId = new Map()) {
  // Tracks left topic count for the processing summary.
  const leftTopicCount = topicCountByIslandId.get(Number(left.id)) || 0;
  // Tracks right topic count for the processing summary.
  const rightTopicCount = topicCountByIslandId.get(Number(right.id)) || 0;
  // Derives the left article count through source article count for island while performing compare island strength.
  const leftArticleCount = sourceArticleCountForIsland(left);
  // Derives the right article count through source article count for island while performing compare island strength.
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
  // Orders values deterministically while performing strongest island for duplicate name group.
  return islands.slice().sort((a, b) => compareIslandStrength(a, b, topicCountByIslandId))[0] || null;
}

// This function checks whether two same-name islands are near-duplicate vectors.
export function isNearDuplicateIslandName(left, right, threshold = ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD) {
  // Rejects the value when normalize island name is not normalize island name.
  if (normalizeIslandName(left?.label) !== normalizeIslandName(right?.label)) return false;

  // Derives the similarity through cosine similarity while checking near duplicate island name.
  const similarity = cosineSimilarity(left?.islandVector, right?.islandVector, {
    coerceNumbers: true
  });

  return similarity >= threshold;
}

// This function title-cases a compact suffix phrase.
function titleCasePhrase(phrase) {
  // Selects the result based on whether word count is at most 3 and to upper case is word.
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
  // Tracks distinct base words while performing clean suffix candidate.
  const baseWords = new Set(normalizeIslandName(baseName).split(/\s+/).filter(Boolean));
  // Derives the words through slice while performing clean suffix candidate.
  const words = String(candidate || '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(word => {
      // Normalizes the normalized before performing clean suffix candidate.
      const normalized = normalizeIslandName(word);
      // Rejects the value when normalized is unavailable or normalized count is below 3.
      if (!normalized || normalized.length < 3) return false;
      // Rejects the value when generic words contains normalized.
      if (GENERIC_WORDS.has(normalized)) return false;
      // Rejects the value when base words contains normalized.
      if (baseWords.has(normalized)) return false;
      return true;
    })
    .slice(0, 4);

  return titleCasePhrase(words.join(' '));
}

// This function extracts capitalized entity-like phrases from source text.
function entityPhrasesFromText(text = '') {
  // Collects matches for the selection made while performing entity phrases from text.
  const matches = String(text || '').match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3}\b/g) || [];
  // Maps source values into the result produced while performing entity phrases from text.
  return matches
    .map(match => match.trim())
    .filter(match => match.length >= 3);
}

// This function returns source article titles from the latest island audit entry.
function sourceArticleTitlesForIsland(island) {
  // Selects the audit based on whether population audit is an array.
  const audit = Array.isArray(island?.populationAudit) ? island.populationAudit : [];
  // Derives the latest required while performing source article titles for island.
  const latest = audit[audit.length - 1] || null;
  const sourceArticles = latest?.sourceArticles?.articles;
  // Returns an empty result when source articles is not an array.
  if (!Array.isArray(sourceArticles)) return [];

  // Maps source values into the result produced while performing source article titles for island.
  return sourceArticles
    .map(article => article?.title)
    .filter(Boolean);
}

// This function collects topic names linked to each island.
async function topicNamesByIslandId(islandIds, transaction) {
  // Returns early when island id is empty.
  if (!islandIds.length) return new Map();

  // Performs the query operation while performing topic names by island id.
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

  // Derives the names by island id required while performing topic names by island id.
  const namesByIslandId = new Map();

  // Processes each rows entry in turn.
  for (const row of rows) {
    // Coerces the island id into the representation required while performing topic names by island id.
    const islandId = Number(row.islandId);
    // Derives the names required while performing topic names by island id.
    const names = namesByIslandId.get(islandId) || [];
    const name = row.name;
    // Handles the case where name is available.
    if (name) names.push(name);
    namesByIslandId.set(islandId, names);
  }

  return namesByIslandId;
}

// This function counts linked topics for each island.
async function topicCountByIslandId(islandIds, transaction) {
  // Returns early when island id is empty.
  if (!islandIds.length) return new Map();

  // Loads the rows needed while performing topic count by island id.
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

  // Maps source values into the result produced while performing topic count by island id.
  return new Map(
    rows.map(row => [Number(row.islandId), Number(row.topicCount || 0)])
  );
}

// This function builds suffix candidates from article titles, topic names, and entity-like phrases.
function suffixCandidatesForIsland(island, topicNames = []) {
  // Derives the titles through source article titles for island while performing suffix candidates for island.
  const titles = sourceArticleTitlesForIsland(island);
  // Derives the entities through flat map while performing suffix candidates for island.
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
  // Processes each suffix candidates for island entry in turn.
  for (const candidate of suffixCandidatesForIsland(island, topicNames)) {
    // Normalizes the suffix before building disambiguated island name.
    const suffix = cleanSuffixCandidate(candidate, baseName);
    // Skips the current entry when suffix is unavailable.
    if (!suffix) continue;

    // Derives the next name through slice while building disambiguated island name.
    const nextName = `${baseName}: ${suffix}`.slice(0, MAX_ISLAND_NAME_LENGTH);
    // Normalizes the normalized before building disambiguated island name.
    const normalized = normalizeIslandName(nextName);
    // Returns early when used names does not contain normalized.
    if (!usedNames.has(normalized)) return nextName;
  }

  return `${baseName}: Variant ${island.id}`.slice(0, MAX_ISLAND_NAME_LENGTH);
}

// This function writes the required concise disambiguation log line.
function logIslandRename({ island, from, to, strongerIsland, similarity }) {
  console.log(
    `[ISLAND] renamed island=${island.id} ` +
    `from=${formatLogString(from)} ` +
    `to=${formatLogString(to)} ` +
    `reason=duplicate-name-low-sim stronger=${strongerIsland.id} ` +
    `sim=${Number(similarity || 0).toFixed(3)}`
  );
}

// This function disambiguates active same-name islands after calibration persistence.
export async function disambiguateDuplicateIslandNamesForUser(userId, options = {}) {
  const { transaction } = options;
  // Loads the active islands needed while performing disambiguate duplicate island names for user.
  const activeIslands = await Island.findAll({
    where: {
      userId,
      archivedInd: false
    },
    order: [['id', 'ASC']],
    transaction
  });
  // Transforms source values into the island id required while performing disambiguate duplicate island names for user.
  const islandIds = activeIslands.map(island => Number(island.id));
  // Derives the topics by island id through topic names by island id while performing disambiguate duplicate island names for user.
  const topicsByIslandId = await topicNamesByIslandId(islandIds, transaction);
  // Derives the topic counts through topic count by island id while performing disambiguate duplicate island names for user.
  const topicCounts = await topicCountByIslandId(islandIds, transaction);
  // Derives the groups through group islands by normalized name while performing disambiguate duplicate island names for user.
  const groups = groupIslandsByNormalizedName(activeIslands);
  // Tracks distinct used names while performing disambiguate duplicate island names for user.
  const usedNames = new Set(activeIslands.map(island => normalizeIslandName(island.label)));
  // Collects the renamed while performing disambiguate duplicate island names for user.
  const renamed = [];
  // Collects the archived while performing disambiguate duplicate island names for user.
  const archived = [];

  // Processes each values entry in turn.
  for (const islands of groups.values()) {
    // Skips the current entry when islands count is at most 1.
    if (islands.length <= 1) continue;

    // Derives the strongest through strongest island for duplicate name group while performing disambiguate duplicate island names for user.
    const strongest = strongestIslandForDuplicateNameGroup(islands, topicCounts);
    // Derives the ranked through sort while performing disambiguate duplicate island names for user.
    const ranked = islands.slice().sort((a, b) => compareIslandStrength(a, b, topicCounts));
    const baseName = strongest.label;

    // Processes each slice entry in turn.
    for (const island of ranked.slice(1)) {
      // Derives the similarity through cosine similarity while performing disambiguate duplicate island names for user.
      const similarity = cosineSimilarity(island.islandVector, strongest.islandVector, {
        coerceNumbers: true
      });

      // Handles the case where similarity reaches island duplicate name similarity threshold.
      if (similarity >= ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD) {
        await island.update({
          archivedInd: true,
          archivedAt: new Date()
        }, { transaction });
        archived.push(Number(island.id));
        continue;
      }

      usedNames.delete(normalizeIslandName(island.label));
      // Builds the disambiguated island name while performing disambiguate duplicate island names for user.
      const nextName = buildDisambiguatedIslandName(
        baseName,
        island,
        topicsByIslandId.get(Number(island.id)) || [],
        usedNames
      );
      usedNames.add(normalizeIslandName(nextName));

      // Skips the current entry when next name is island label.
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
