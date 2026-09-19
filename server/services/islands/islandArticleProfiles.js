import { isActiveIsland, islandBehaviorTime } from './islandDeadline.js';
import { Op } from 'sequelize';
import { BEHAVIOR_TIMESTAMP_FIELDS, signalTimestamp } from '../articles/articleBehaviorTime.js';
import db from '../../models/index.js';
import { aggregateEmbeddingModel, embeddingSimilarity, hasEmbeddingModel } from '../vectors/embeddingModel.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { summarizeIslandSelection } from './islandCapacity.js';
import {
  DEFAULT_ARTICLE_AFFINITY_THRESHOLD,
  DEFAULT_ARTICLE_SIGNAL_THRESHOLD,
  DEFAULT_MAX_ISLANDS_PER_USER,
  ISLAND_DISCOVERY_PROFILE_LIMIT,
  ISLAND_SIGNAL_NORMALIZATION,
  resolveIslandCapacity,
  ISLAND_DEBUG,
  SIGNAL_WEIGHTS,
  MAX_ARTICLE_CLICKS,
  SIGNAL_HALF_LIFE_DAYS,
  addPositiveSignals,
  articleMagnitude,
  buildPositiveSignalsAccumulator,
  clamp,
  debugIsland,
  normalizeVector,
  behaviorRecencyWeight,
  weightedAverageVector
} from './islandVectorUtils.js';

// Provides the shared dependencies used by this service.
const { Article } = db;

// This function converts article behavior fields into weighted positive and negative signals.
export function computeArticleSignals(article) {
  // Legacy contradictory explicit flags resolve to negative, matching behavioral fallback.
  const positives = article.positiveInd === 1 && article.negativeInd !== 1 ? 1 : 0;
  // Selects the stars based on whether article favorite status is 1.
  const stars = article.favoriteInd === 1 ? 1 : 0;
  // Cap scored click evidence without changing the stored click counter.
  const clicks = Math.min(article.clickedAmount || 0, MAX_ARTICLE_CLICKS);
  // Selects the deep reads based on whether article reaches 3.
  const deepReads = (article.attentionBucket || 0) >= 3 ? 1 : 0;
  // Selects the negative based on whether article negative status is 1.
  const negative = article.negativeInd === 1 ? 1 : 0;
  // Each signal decays from its own interaction, before signals are combined.
  const recency = field => behaviorRecencyWeight(signalTimestamp(article, field), SIGNAL_HALF_LIFE_DAYS[field]);

  // Derives the positive score required while computing article signals.
  const positiveScore = (
    positives * SIGNAL_WEIGHTS.positive * recency('positiveFeedbackAt') +
    stars * SIGNAL_WEIGHTS.star * recency('favoritedAt') +
    clicks * SIGNAL_WEIGHTS.click * recency('lastClickedAt') +
    deepReads * SIGNAL_WEIGHTS.deepRead * recency('lastMeaningfulReadAt')
  );

  // Derives the negative score required while computing article signals.
  const negativeScore = negative * SIGNAL_WEIGHTS.negative * recency('negativeFeedbackAt');

  return {
    positiveScore,
    negativeScore,
    engagementScore: Math.max(0, positiveScore),
    positiveSignals: {
      positives,
      stars,
      clicks,
      deepReads,
      negatives: negative
    }
  };
}

// Use the same qualifying signal clocks for formation priority and durable lifecycle activity.
export function qualifyingArticleBehaviorTime(article, signals = computeArticleSignals(article),
  preferenceSign = Math.sign(signals.positiveScore - signals.negativeScore)) {
  if (![-1, 1].includes(preferenceSign) || Math.abs(signals.positiveScore - signals.negativeScore) < DEFAULT_ARTICLE_SIGNAL_THRESHOLD) return null;
  const counts = signals.positiveSignals;
  const strengths = {
    lastClickedAt: counts.clicks * SIGNAL_WEIGHTS.click,
    lastMeaningfulReadAt: counts.deepReads * SIGNAL_WEIGHTS.deepRead,
    favoritedAt: counts.stars * SIGNAL_WEIGHTS.star,
    positiveFeedbackAt: counts.positives * SIGNAL_WEIGHTS.positive,
    negativeFeedbackAt: counts.negatives * SIGNAL_WEIGHTS.negative
  };
  const times = Object.entries(strengths).flatMap(([field, strength]) => {
    // Opposing behavior changes the net preference first; it cannot renew the other sign.
    if ((field === 'negativeFeedbackAt' ? -1 : 1) !== preferenceSign) return [];
    const value = signalTimestamp(article, field);
    const time = islandBehaviorTime(value);
    return time != null && strength * behaviorRecencyWeight(value, SIGNAL_HALF_LIFE_DAYS[field]) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD
      ? [time] : [];
  });
  return times.length ? new Date(Math.max(...times)) : null;
}

// This function converts an engaged article into a profile for article-based island clustering.
function computeBehavioralArticleProfile(article) {
  // Computes the article signals while computing behavioral article profile.
  const articleSignals = computeArticleSignals(article);
  // Derives the score required while computing behavioral article profile.
  const score = articleSignals.positiveScore - articleSignals.negativeScore;

  // Selects the result based on whether article article vector is an array.
  return {
    articleId: article.id,
    title: article.title,
    vector: Array.isArray(article.articleVector) ? article.articleVector : null,
    embedding_model: article.embedding_model ?? null,
    score,
    lastBehaviorAt: qualifyingArticleBehaviorTime(article, articleSignals),
    positiveSignals: articleSignals.positiveSignals,
    publishedAt: article.publishedAt
  };
}

// This function selects a readable label for an article-based island.
function buildArticleIslandLabel(articleProfiles) {
  // Keeps the titles entries eligible while building article island label.
  const titles = articleProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.score) - Math.abs(a.score)) || (a.articleId - b.articleId))
    .map(article => article.title)
    .filter(Boolean);

  // Returns early when titles is empty.
  if (!titles.length) return 'Interest Island';
  return titles[0].slice(0, 255);
}

// This function computes an island weight from average behavioral article scores.
export function buildArticleIslandWeight(articleProfiles) {
  // Returns early when article profiles is empty.
  if (!articleProfiles.length) return 0;

  // Derives the average score required while building article island weight.
  const averageScore = articleProfiles.reduce((sum, article) => sum + article.score, 0) / articleProfiles.length;
  // A favorite, deep read and capped clicks retain the existing seven-point scale,
  // so reducing click evidence does not amplify unchanged signals.
  const denominator = Math.max(1, ISLAND_SIGNAL_NORMALIZATION);
  // Derives the breadth bonus required while building article island weight.
  const breadthBonus = Math.sign(averageScore) * Math.min(0.2, articleProfiles.length * 0.03);

  return Number(clamp((averageScore / denominator) + breadthBonus, -1, 1).toFixed(4));
}

// This function totals positive signal counters across article profiles.
function buildArticleIslandPositiveSignals(articleProfiles) {
  // Builds the positive signals accumulator while building article island positive signals.
  const signals = buildPositiveSignalsAccumulator();

  // Processes each article profiles entry in turn.
  for (const article of articleProfiles) {
    addPositiveSignals(signals, article.positiveSignals);
  }

  return signals;
}

// This function adds an article profile to a community and refreshes its centroid.
function addArticleToCommunity(community, article) {
  // Avoids adding the same article evidence to a community twice.
  if (community.articles.some(existing => existing.articleId === article.articleId)) return;

  community.articles.push(article);

  // Handles the case where article vector is an array and article vector is non-empty.
  if (Array.isArray(article.vector) && article.vector.length) {
    community.samples.push({ vector: article.vector, weight: articleMagnitude(article.score) });
    community.vector = weightedAverageVector(community.samples) || community.vector;
  }
}

// Alternate strong and recent evidence so either population can supply candidate seeds.
// The complete snapshot remains available to existing Islands' lifecycle reconstruction.
function discoveryProfiles(articleProfiles) {
  const activeFirst = (a, b) => Number(isActiveIsland(b)) - Number(isActiveIsland(a));
  const strong = articleProfiles.slice().sort((a, b) => activeFirst(a, b) || Math.abs(b.score) - Math.abs(a.score) || a.articleId - b.articleId);
  const recent = articleProfiles.slice().sort((a, b) => activeFirst(a, b) || Number(b.lastBehaviorAt) - Number(a.lastBehaviorAt) || a.articleId - b.articleId);
  const selected = new Map();
  for (let index = 0; index < strong.length && selected.size < ISLAND_DISCOVERY_PROFILE_LIMIT; index++) {
    for (const article of [strong[index], recent[index]]) {
      if (selected.size < ISLAND_DISCOVERY_PROFILE_LIMIT) selected.set(article.articleId, article);
    }
  }
  return [...selected.values()];
}

// Centroid movement cannot authorize a member below the existing affinity threshold.
function coherentCommunity(bucket) {
  let articles = bucket.articles;
  while (articles.length) {
    const vector = weightedAverageVector(articles.map(article => ({ vector: article.vector, weight: articleMagnitude(article.score) })));
    const eligible = articles.filter(article => embeddingSimilarity(article.vector, vector, article.embedding_model,
      articles[0].embedding_model) >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD);
    if (eligible.length === articles.length) return { articles, vector };
    articles = eligible;
  }
  return null;
}

// Discover communities before selecting active slots; the discovery input bounds work.
function buildBehavioralArticleCommunities(articleProfiles, evidenceById, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER) {
  // Derives the sorted through sort while building behavioral article communities.
  const discovered = discoveryProfiles(articleProfiles);
  const sorted = discovered
    .slice()
    // Expired history cannot consume the formation slots before fresh preferences are considered.
    .sort((a, b) => Number(isActiveIsland(b)) - Number(isActiveIsland(a))
      || (Math.abs(b.score) - Math.abs(a.score)) || (a.articleId - b.articleId));

  // Collects the communities while building behavioral article communities.
  const communities = [];

  // Processes each sorted entry in turn.
  for (const article of sorted) {
    // Handles the case where communities is empty.
    if (!communities.length) {
      communities.push({
        articles: [article],
        samples: [{ vector: article.vector, weight: articleMagnitude(article.score) }],
        vector: normalizeVector(article.vector)
      });
      continue;
    }

    // Derives the ranked communities through sort while building behavioral article communities.
    const rankedCommunities = communities
      .map(community => ({
        community,
        affinity: embeddingSimilarity(article.vector, community.vector, article.embedding_model, community.articles[0].embedding_model)
      }))
      .sort((a, b) => b.affinity - a.affinity);

    // Derives the best required while building behavioral article communities.
    const best = rankedCommunities[0] || null;

    // Handles the case where best is available and best affinity reaches default article affinity threshold.
    if (best && best.affinity >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD) {
      addArticleToCommunity(best.community, article);
      continue;
    }

    communities.push({
      articles: [article],
      samples: [{ vector: article.vector, weight: articleMagnitude(article.score) }],
      vector: normalizeVector(article.vector)
    });
  }

  // Maps source values into the result produced while building behavioral article communities.
  const candidates = communities.map(coherentCommunity).filter(Boolean)
    .map(bucket => ({
      articles: bucket.articles,
      vector: bucket.vector,
      embedding_model: aggregateEmbeddingModel(bucket.articles),
      weight: buildArticleIslandWeight(bucket.articles),
      positiveSignals: buildArticleIslandPositiveSignals(bucket.articles),
      label: buildArticleIslandLabel(bucket.articles)
    }));
  const selected = candidates.map(community => ({ community, selection: summarizeIslandSelection(
    community.articles.map(article => evidenceById.get(String(article.articleId))), community.vector, community.embedding_model, community.weight)
  })).sort((a, b) => Number(isActiveIsland({ lastBehaviorAt: b.selection.lastBehaviorAt || null }))
      - Number(isActiveIsland({ lastBehaviorAt: a.selection.lastBehaviorAt || null }))
    || b.selection.collectiveStrength - a.selection.collectiveStrength || b.selection.strength - a.selection.strength
    || b.selection.confidence - a.selection.confidence || b.selection.lastBehaviorAt - a.selection.lastBehaviorAt
    || a.community.articles[0].articleId - b.community.articles[0].articleId)
    .slice(0, maxIslands).map(row => row.community);
  selected.discoverySummary = { discoveryProfileCount: discovered.length, candidateCommunityCount: candidates.length };
  return selected;
}

export async function loadIslandBehavioralArticles(userId, { transaction } = {}) {
  // Formation applies the complete magnitude/id order below; avoid a redundant SQL sort.
  return Article.findAll({
    where: {
      userId,
      ...canonicalArticleWhere(),
      filteredInd: false,
      articleVector: { [Op.ne]: null },
      [Op.or]: [
        { positiveInd: 1 },
        { favoriteInd: 1 },
        { clickedAmount: { [Op.gt]: 0 } },
        { attentionBucket: { [Op.gte]: 3 } },
        { negativeInd: 1 }
      ]
    },
    attributes: [
      'id',
      'userId',
      'filteredInd',
      'duplicateOfArticleId',
      'feedId',
      'title',
      'articleVector',
      'embedding_model',
      'positiveInd',
      'favoriteInd',
      'clickedAmount',
      'attentionBucket',
      'negativeInd',
      'publishedAt',
      ...BEHAVIOR_TIMESTAMP_FIELDS
    ],
    transaction
  });
}

// This function builds article-based island profiles from direct user behavior.
export async function buildInterestIslandProfilesForUser(userId, options = {}) {
  const maxIslands = resolveIslandCapacity(options.maxIslands);
  const articles = await loadIslandBehavioralArticles(userId, options);

  // Keeps the article profiles entries eligible while building interest island profiles for user.
  const articleProfiles = articles
    .map(computeBehavioralArticleProfile)
    .filter(profile => hasEmbeddingModel(profile.embedding_model) && Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => Math.abs(profile.score) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD);

  // Builds the behavioral article communities while building interest island profiles for user.
  const evidenceById = new Map(articles.map(article => [String(article.id), article]));
  const communities = buildBehavioralArticleCommunities(articleProfiles, evidenceById, maxIslands);
  // Reuse this complete owned snapshot for lifecycle decisions, even below formation's score cutoff.
  communities.behavioralEvidence = articles;

  const assignedCount = communities.reduce((sum, community) => sum + community.articles.length, 0);
  communities.summary = {
    ...communities.discoverySummary,
    eligibleBehavioralProfiles: articleProfiles.length,
    assignedBehavioralProfiles: assignedCount,
    unassignedBehavioralProfiles: articleProfiles.length - assignedCount
  };

  // Handles the case where island debug is available.
  if (ISLAND_DEBUG) {
    // Maps source values into the result produced while building interest island profiles for user.
    debugIsland('behavioral-article-community-formation', {
      userId,
      articleCount: articleProfiles.length,
      maxIslands,
      affinityThreshold: DEFAULT_ARTICLE_AFFINITY_THRESHOLD,
      finalCommunities: communities.map((community, index) => ({
        index: index + 1,
        weight: Number(community.weight || 0),
        label: community.label,
        articleCount: community.articles.length,
        articleIds: community.articles.map(article => article.articleId).slice(0, 12)
      }))
    });
  }

  return communities;
}
