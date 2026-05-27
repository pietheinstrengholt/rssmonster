import { Op } from 'sequelize';
import db from '../../models/index.js';
import buildArticleInterestScoresForUser from './buildArticleInterestScores.js';

// This service builds and enriches "interest islands" from user behavior and topic history.
// Islands represent durable preference areas that can later score articles and group topics.

const { User, Topic, Article, Island, IslandTopic, IslandTaxonomy, sequelize } = db;

const DEFAULT_MAX_ISLANDS_PER_USER = Number.parseInt(process.env.MAX_INTEREST_ISLANDS, 10) || 10;
const DEFAULT_TOPIC_AFFINITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_AFFINITY_THRESHOLD || '0.12');
const DEFAULT_ARTICLE_AFFINITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_AFFINITY_THRESHOLD || '0.64');
const DEFAULT_MAX_COMMUNITIES_PER_TOPIC = Number.parseInt(process.env.ISLAND_MAX_COMMUNITIES_PER_TOPIC, 10) || 2;
const DEFAULT_TOPIC_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_CONFIDENCE_THRESHOLD || '0.10');
const DEFAULT_ARTICLE_SIGNAL_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARTICLE_SIGNAL_THRESHOLD || '0.05');
const DEFAULT_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD || '0.62'
);
const DEFAULT_ISLAND_MATCH_THRESHOLD = Number.parseFloat(process.env.ISLAND_PROFILE_MATCH_THRESHOLD || '0.78');
const DEFAULT_ISLAND_VECTOR_ALPHA = Number.parseFloat(process.env.ISLAND_VECTOR_ALPHA || '0.35');
const DEFAULT_RECENCY_HALF_LIFE_DAYS = Number.parseFloat(process.env.ISLAND_RECENCY_HALF_LIFE_DAYS || '30');
const DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD || '0.12');
const DEFAULT_ARCHIVE_STALE_DAYS = Number.parseInt(process.env.ISLAND_ARCHIVE_STALE_DAYS, 10) || 45;
const DEFAULT_AUDIT_MAX_RUNS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_RUNS, 10) || 30;
const DEFAULT_AUDIT_MAX_ARTICLE_IDS = Number.parseInt(process.env.ISLAND_AUDIT_MAX_ARTICLE_IDS, 10) || 300;
const DEFAULT_ISLAND_MEMBERSHIP_DECAY = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_DECAY || '0.82');
const DEFAULT_ISLAND_MEMBERSHIP_BLEND = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_BLEND || '0.65');
const DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE = Number.parseFloat(process.env.ISLAND_MEMBERSHIP_MIN_CONFIDENCE || '0.05');
const DEFAULT_ENGAGEMENT_TIME_BUCKET_HOURS = Number.parseInt(process.env.ISLAND_ENGAGEMENT_TIME_BUCKET_HOURS, 10) || 12;
const DEFAULT_TEMPORAL_AFFINITY_WEIGHT = Number.parseFloat(process.env.ISLAND_TEMPORAL_AFFINITY_WEIGHT || '0.65');
const ISLAND_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.ISLAND_DEBUG || process.env.EVENT_DEBUG || '').toLowerCase()
);

const SIGNAL_WEIGHTS = {
  star: 4,
  click: 1.5,
  deepRead: 3,
  negative: 4,
  topicAffinity: 2,
  eventCount: 0.25
};

// These helpers keep scores bounded and avoid zero weights in weighted averages.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
// This helper converts topic strength into a safe positive sample weight.
const topicMagnitude = (strength) => Math.max(0.0001, Math.abs(Number(strength || 0)));
// This helper converts article score into a safe positive sample weight.
const articleMagnitude = (score) => Math.max(0.0001, Math.abs(Number(score || 0)));

// This function writes island debug output when island debugging is enabled.
function debugIsland(message, payload = null) {
  if (!ISLAND_DEBUG) return;

  if (payload == null) {
    console.log(`[ISLAND DEBUG] ${message}`);
    return;
  }

  console.log(`[ISLAND DEBUG] ${message}`, payload);
}

// This function compares two vectors with cosine similarity.
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length || !b.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// This function normalizes vectors so centroid comparisons stay scale-independent.
function normalizeVector(vector) {
  if (!Array.isArray(vector) || !vector.length) return null;

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }

  if (!norm) return vector.map(() => 0);

  const scale = Math.sqrt(norm);
  return vector.map(value => value / scale);
}

// This function builds a normalized weighted centroid from vector samples.
function weightedAverageVector(samples) {
  const usable = samples.filter(sample => Array.isArray(sample.vector) && sample.vector.length);
  if (!usable.length) return null;

  const dimension = usable[0].vector.length;
  const totals = Array(dimension).fill(0);
  let totalWeight = 0;

  for (const sample of usable) {
    if (sample.vector.length !== dimension) continue;

    const weight = Math.max(0.0001, sample.weight || 0);
    totalWeight += weight;

    for (let i = 0; i < dimension; i++) {
      totals[i] += sample.vector[i] * weight;
    }
  }

  if (!totalWeight) return null;

  return normalizeVector(totals.map(value => value / totalWeight));
}

// This function blends an existing island vector with new evidence.
function blendIslandVector(existingVector, incomingVector, alpha = DEFAULT_ISLAND_VECTOR_ALPHA) {
  if (!Array.isArray(existingVector)) return normalizeVector(incomingVector);
  if (!Array.isArray(incomingVector)) return normalizeVector(existingVector);
  if (existingVector.length !== incomingVector.length) return normalizeVector(incomingVector);

  const clampedAlpha = clamp(alpha, 0, 1);
  return normalizeVector(
    existingVector.map(
      (value, index) => value * (1 - clampedAlpha) + incomingVector[index] * clampedAlpha
    )
  );
}

// This function returns a recency multiplier for behavioral signals.
function topicRecencyWeight(publishedAt) {
  if (!publishedAt) return 1;

  const ageDays = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24));
  return Math.exp(-ageDays / DEFAULT_RECENCY_HALF_LIFE_DAYS);
}

// This function creates an empty positive-signal counter object.
function buildPositiveSignalsAccumulator() {
  return {
    stars: 0,
    clicks: 0,
    deepReads: 0,
    negatives: 0
  };
}

// This function adds one positive-signal counter into another.
function addPositiveSignals(target, source) {
  target.stars += source.stars;
  target.clicks += source.clicks;
  target.deepReads += source.deepReads;
  target.negatives += source.negatives || 0;
}

// This function converts stored signal JSON into numeric counters.
function normalizePositiveSignals(source = {}) {
  return {
    stars: Number(source.stars || 0),
    clicks: Number(source.clicks || 0),
    deepReads: Number(source.deepReads || 0),
    negatives: Number(source.negatives || 0)
  };
}

// This function merges existing and incoming positive-signal counters.
function mergePositiveSignals(existingSignals = {}, incomingSignals = {}) {
  const merged = normalizePositiveSignals(existingSignals);
  const incoming = normalizePositiveSignals(incomingSignals);

  merged.stars += incoming.stars;
  merged.clicks += incoming.clicks;
  merged.deepReads += incoming.deepReads;
  merged.negatives += incoming.negatives;

  return merged;
}

// This function decides whether an island has gone stale enough for archival handling.
function isStaleIsland(island) {
  const updatedAt = island?.updatedAt ? new Date(island.updatedAt).getTime() : null;
  if (!Number.isFinite(updatedAt)) return true;

  const staleMs = DEFAULT_ARCHIVE_STALE_DAYS * 24 * 60 * 60 * 1000;
  return (Date.now() - updatedAt) >= staleMs;
}

// This function appends one bounded population-audit entry to an island's history.
function appendPopulationAudit(existingAudit, entry) {
  const previous = Array.isArray(existingAudit) ? existingAudit : [];
  const next = [...previous, entry];

  if (next.length <= DEFAULT_AUDIT_MAX_RUNS) return next;
  return next.slice(next.length - DEFAULT_AUDIT_MAX_RUNS);
}

// This function evolves IslandTopic memberships with blending, decay, and cleanup.
async function evolveIslandTopicMemberships(islandId, islandRows, transaction) {
  const existingRows = await IslandTopic.findAll({
    where: { islandId },
    raw: true,
    transaction
  });

  const existingByTopicId = new Map(
    existingRows.map(row => [Number(row.topicId), row])
  );

  const nextRows = [];
  const nextTopicIds = new Set();
  const blendWeight = clamp(DEFAULT_ISLAND_MEMBERSHIP_BLEND, 0, 1);
  const decayWeight = clamp(DEFAULT_ISLAND_MEMBERSHIP_DECAY, 0, 1);

  for (const row of islandRows) {
    const topicId = Number(row.topicId);
    if (!Number.isFinite(topicId)) continue;

    const previous = existingByTopicId.get(topicId);
    const similarity = previous
      ? clamp(Number(previous.similarity || 0) * (1 - blendWeight) + Number(row.similarity || 0) * blendWeight, 0, 1)
      : clamp(Number(row.similarity || 0), 0, 1);
    const confidence = previous
      ? clamp(Number(previous.confidence || 0) * (1 - blendWeight) + Number(row.confidence || 0) * blendWeight, 0, 1)
      : clamp(Number(row.confidence || 0), 0, 1);

    nextRows.push({
      islandId,
      topicId,
      similarity: Number(similarity.toFixed(4)),
      confidence: Number(confidence.toFixed(4))
    });

    nextTopicIds.add(topicId);
  }

  for (const previous of existingRows) {
    const topicId = Number(previous.topicId);
    if (nextTopicIds.has(topicId)) continue;

    const decayedConfidence = clamp(Number(previous.confidence || 0) * decayWeight, 0, 1);
    if (decayedConfidence < DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE) continue;

    const decayedSimilarity = clamp(Number(previous.similarity || 0) * decayWeight, 0, 1);

    nextRows.push({
      islandId,
      topicId,
      similarity: Number(decayedSimilarity.toFixed(4)),
      confidence: Number(decayedConfidence.toFixed(4))
    });

    nextTopicIds.add(topicId);
  }

  if (nextRows.length) {
    await IslandTopic.bulkCreate(nextRows, {
      updateOnDuplicate: ['similarity', 'confidence'],
      transaction
    });
  }

  const removableTopicIds = existingRows
    .map(row => Number(row.topicId))
    .filter(topicId => Number.isFinite(topicId) && !nextTopicIds.has(topicId));

  if (removableTopicIds.length) {
    await IslandTopic.destroy({
      where: {
        islandId,
        topicId: { [Op.in]: removableTopicIds }
      },
      transaction
    });
  }
}

// This function builds a compact audit entry describing which articles populated an island.
async function buildPopulationAuditEntry({ userId, topicIds = [], articleIds = [], transaction }) {
  if (!topicIds.length && !articleIds.length) {
    return {
      runAt: new Date().toISOString(),
      topicIds: [],
      articleIds: [],
      metrics: {
        relatedArticleCount: 0,
        starredCount: 0,
        clickedCount: 0,
        negativeCount: 0
      },
      sourceArticles: {
        starredArticleIds: [],
        clickedArticleIds: [],
        negativeArticleIds: [],
        articles: []
      }
    };
  }

  const rows = articleIds.length
    ? await Article.findAll({
      where: {
        userId,
        id: { [Op.in]: articleIds }
      },
      attributes: ['id', 'title', 'starInd', 'clickedAmount', 'negativeInd'],
      raw: true,
      transaction
    })
    : await sequelize.query(
      `
      SELECT DISTINCT
        a.id,
        a.title,
        a.starInd,
        a.clickedAmount,
        a.negativeInd
      FROM article_topics atp
      INNER JOIN articles a
        ON a.id = atp.articleId
       AND a.userId = :userId
      WHERE atp.topicId IN (:topicIds)
      `,
      {
        replacements: {
          userId,
          topicIds
        },
        type: db.Sequelize.QueryTypes.SELECT,
        transaction
      }
    );

  const articleRows = rows
    .map(row => ({
      id: Number(row.id),
      title: row.title,
      starInd: Number(row.starInd || 0),
      clickedAmount: Number(row.clickedAmount || 0),
      negativeInd: Number(row.negativeInd || 0)
    }))
    .filter(row => Number.isFinite(row.id))
    .sort((a, b) => (
      b.starInd - a.starInd ||
      b.clickedAmount - a.clickedAmount ||
      b.negativeInd - a.negativeInd ||
      a.id - b.id
    ));

  const starredRows = articleRows.filter(row => row.starInd === 1);
  const clickedRows = articleRows.filter(row => row.clickedAmount > 0);
  const negativeRows = articleRows.filter(row => row.negativeInd === 1);

  const starredArticleIds = starredRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

  const clickedArticleIds = clickedRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

  const negativeArticleIds = negativeRows
    .map(row => Number(row.id))
    .slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS);

  return {
    runAt: new Date().toISOString(),
    topicIds,
    articleIds: articleIds.slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS),
    metrics: {
      relatedArticleCount: articleRows.length,
      starredCount: starredRows.length,
      clickedCount: clickedRows.length,
      negativeCount: negativeRows.length
    },
    sourceArticles: {
      starredArticleIds,
      clickedArticleIds,
      negativeArticleIds,
      articles: articleRows.slice(0, DEFAULT_AUDIT_MAX_ARTICLE_IDS)
    }
  };
}

// This function picks the nearest active taxonomy display name for an island vector.
function resolveTaxonomyDisplayName(vector, taxonomyRows = []) {
  if (!Array.isArray(vector) || !vector.length) return null;

  let bestName = null;
  let bestSimilarity = -1;

  for (const row of taxonomyRows) {
    const similarity = cosineSimilarity(vector, row.vector);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestName = row.displayName;
    }
  }

  return bestName || null;
}

// This function derives a fallback island label from the strongest topic names.
function resolveTopicFallbackLabel(profile) {
  const names = (profile?.topics || [])
    .slice()
    .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId))
    .map(topic => topic.name)
    .filter(Boolean);

  if (!names.length) return null;
  if (names.length === 1) return names[0].slice(0, 255);

  return `${names[0]} / ${names[1]}`.slice(0, 255);
}

// This function converts article behavior fields into weighted positive and negative signals.
function computeArticleSignals(article) {
  const stars = article.starInd === 1 ? 1 : 0;
  const clicks = Math.min(article.clickedAmount || 0, 3);
  const deepReads = (article.attentionBucket || 0) >= 3 ? 1 : 0;
  const negative = article.negativeInd === 1 ? 1 : 0;
  const recency = topicRecencyWeight(article.published);

  const positiveScore = (
    stars * SIGNAL_WEIGHTS.star +
    clicks * SIGNAL_WEIGHTS.click +
    deepReads * SIGNAL_WEIGHTS.deepRead
  ) * recency;

  const negativeScore = negative * SIGNAL_WEIGHTS.negative;

  return {
    positiveScore,
    negativeScore,
    engagementScore: Math.max(0, positiveScore),
    positiveSignals: {
      stars,
      clicks,
      deepReads,
      negatives: negative
    }
  };
}

// This function converts an engaged article into a profile for article-based island clustering.
function computeBehavioralArticleProfile(article) {
  const articleSignals = computeArticleSignals(article);
  const score = articleSignals.positiveScore - articleSignals.negativeScore;

  return {
    articleId: article.id,
    title: article.title,
    vector: Array.isArray(article.articleVector) ? article.articleVector : null,
    score,
    positiveSignals: articleSignals.positiveSignals,
    published: article.published
  };
}

// This function selects a readable label for an article-based island.
function buildArticleIslandLabel(articleProfiles) {
  const titles = articleProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.score) - Math.abs(a.score)) || (a.articleId - b.articleId))
    .map(article => article.title)
    .filter(Boolean);

  if (!titles.length) return 'Interest Island';
  return titles[0].slice(0, 255);
}

// This function computes an island weight from average behavioral article scores.
function buildArticleIslandWeight(articleProfiles) {
  if (!articleProfiles.length) return 0;

  const averageScore = articleProfiles.reduce((sum, article) => sum + article.score, 0) / articleProfiles.length;
  const denominator = Math.max(1, SIGNAL_WEIGHTS.star + SIGNAL_WEIGHTS.deepRead + SIGNAL_WEIGHTS.click);
  const breadthBonus = Math.sign(averageScore) * Math.min(0.2, articleProfiles.length * 0.03);

  return Number(clamp((averageScore / denominator) + breadthBonus, -1, 1).toFixed(4));
}

// This function totals positive signal counters across article profiles.
function buildArticleIslandPositiveSignals(articleProfiles) {
  const signals = buildPositiveSignalsAccumulator();

  for (const article of articleProfiles) {
    addPositiveSignals(signals, article.positiveSignals);
  }

  return signals;
}

// This function adds an article profile to a community and refreshes its centroid.
function addArticleToCommunity(community, article) {
  if (community.articles.some(existing => existing.articleId === article.articleId)) return;

  community.articles.push(article);

  if (Array.isArray(article.vector) && article.vector.length) {
    community.samples.push({ vector: article.vector, weight: articleMagnitude(article.score) });
    community.vector = weightedAverageVector(community.samples) || community.vector;
  }
}

// This function clusters engaged article profiles into candidate interest islands.
function buildBehavioralArticleCommunities(articleProfiles, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER) {
  const sorted = articleProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.score) - Math.abs(a.score)) || (a.articleId - b.articleId));

  const communities = [];

  for (const article of sorted) {
    if (!communities.length) {
      communities.push({
        articles: [article],
        samples: [{ vector: article.vector, weight: articleMagnitude(article.score) }],
        vector: normalizeVector(article.vector)
      });
      continue;
    }

    const rankedCommunities = communities
      .map(community => ({
        community,
        affinity: cosineSimilarity(article.vector, community.vector)
      }))
      .sort((a, b) => b.affinity - a.affinity);

    const best = rankedCommunities[0] || null;

    if (best && best.affinity >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD) {
      addArticleToCommunity(best.community, article);
      continue;
    }

    if (communities.length >= maxIslands && best) {
      addArticleToCommunity(best.community, article);
      continue;
    }

    communities.push({
      articles: [article],
      samples: [{ vector: article.vector, weight: articleMagnitude(article.score) }],
      vector: normalizeVector(article.vector)
    });
  }

  return communities
    .map(bucket => ({
      articles: bucket.articles,
      topics: [],
      vector: weightedAverageVector(bucket.samples) || bucket.vector,
      weight: buildArticleIslandWeight(bucket.articles),
      positiveSignals: buildArticleIslandPositiveSignals(bucket.articles),
      label: buildArticleIslandLabel(bucket.articles)
    }))
    .sort((a, b) => (Math.abs(b.weight) - Math.abs(a.weight)) || (b.articles.length - a.articles.length));
}

// This function converts a topic and its article behavior into an island clustering profile.
function computeTopicProfile(topic) {
  const articles = topic.articles || [];
  const positiveSignals = buildPositiveSignalsAccumulator();
  const engagementByArticleId = new Map();
  const engagementByTimeBucket = new Map();
  let rawScore = 0;
  let evidenceCount = 0;

  for (const article of articles) {
    const articleSignals = computeArticleSignals(article);
    addPositiveSignals(positiveSignals, articleSignals.positiveSignals);
    rawScore += articleSignals.positiveScore;
    rawScore -= articleSignals.negativeScore;

    const articleId = Number(article.id);
    if (Number.isFinite(articleId) && articleSignals.engagementScore > 0) {
      engagementByArticleId.set(
        articleId,
        (engagementByArticleId.get(articleId) || 0) + articleSignals.engagementScore
      );

      const publishedTs = article.published ? new Date(article.published).getTime() : null;
      if (Number.isFinite(publishedTs)) {
        const bucketMs = Math.max(1, DEFAULT_ENGAGEMENT_TIME_BUCKET_HOURS) * 60 * 60 * 1000;
        const bucket = Math.floor(publishedTs / bucketMs);
        engagementByTimeBucket.set(
          bucket,
          (engagementByTimeBucket.get(bucket) || 0) + articleSignals.engagementScore
        );
      }
    }

    evidenceCount += 1;
  }

  rawScore += clamp(Number(topic.affinityScore || 0), 0, 1) * SIGNAL_WEIGHTS.topicAffinity;
  rawScore += Math.min(topic.eventCount || 0, 12) * SIGNAL_WEIGHTS.eventCount;

  const denominator = Math.max(1, (topic.articleCount || evidenceCount || 1) * 6);
  const strength = clamp(rawScore / denominator, -1, 1);

  return {
    topicId: topic.id,
    name: topic.name,
    vector: Array.isArray(topic.topicVector) ? topic.topicVector : null,
    strength,
    evidenceCount,
    positiveSignals,
    engagementByArticleId,
    engagementByTimeBucket
  };
}

// This function selects a readable label for a topic-based island.
function buildIslandLabel(topicProfiles) {
  const names = topicProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId))
    .map(topic => topic.name)
    .filter(Boolean);

  if (!names.length) return 'Interest Island';
  if (names.length === 1) return names[0].slice(0, 255);

  return `${names[0]} / ${names[1]}`.slice(0, 255);
}

// This function computes island weight from topic strengths plus a breadth bonus.
function buildIslandWeight(topicProfiles) {
  if (!topicProfiles.length) return 0;

  const averageStrength = topicProfiles.reduce((sum, topic) => sum + topic.strength, 0) / topicProfiles.length;
  const breadthBonus = Math.sign(averageStrength) * Math.min(0.2, topicProfiles.length * 0.03);

  return Number(clamp(averageStrength + breadthBonus, -1, 1).toFixed(4));
}

// This function totals positive signal counters across topic profiles.
function buildIslandPositiveSignals(topicProfiles) {
  const signals = buildPositiveSignalsAccumulator();

  for (const topic of topicProfiles) {
    addPositiveSignals(signals, topic.positiveSignals);
  }

  return signals;
}

// This function compares two weighted engagement maps with weighted Jaccard similarity.
function weightedJaccardSimilarity(scoresA, scoresB) {
  if (!(scoresA instanceof Map) || !(scoresB instanceof Map)) return 0;
  if (!scoresA.size || !scoresB.size) return 0;

  const keys = new Set([...scoresA.keys(), ...scoresB.keys()]);
  if (!keys.size) return 0;

  let intersection = 0;
  let union = 0;

  for (const articleId of keys) {
    const valueA = Number(scoresA.get(articleId) || 0);
    const valueB = Number(scoresB.get(articleId) || 0);

    intersection += Math.min(valueA, valueB);
    union += Math.max(valueA, valueB);
  }

  if (!union) return 0;
  return clamp(intersection / union, 0, 1);
}

// This function scores topic affinity from shared article engagement and temporal behavior.
function behavioralAffinityScore(topicA, topicB) {
  const articleOverlapAffinity = weightedJaccardSimilarity(
    topicA?.engagementByArticleId,
    topicB?.engagementByArticleId
  );

  const temporalPatternAffinity = weightedJaccardSimilarity(
    topicA?.engagementByTimeBucket,
    topicB?.engagementByTimeBucket
  );

  const temporalWeight = clamp(DEFAULT_TEMPORAL_AFFINITY_WEIGHT, 0, 1);
  const articleWeight = 1 - temporalWeight;

  return clamp(
    articleOverlapAffinity * articleWeight + temporalPatternAffinity * temporalWeight,
    0,
    1
  );
}

// This function computes a topic's average behavioral affinity with one community.
function averageAffinityWithCommunity(topic, communityTopics) {
  if (!communityTopics.length) return 0;

  const sum = communityTopics.reduce(
    (total, member) => total + behavioralAffinityScore(topic, member),
    0
  );

  return sum / communityTopics.length;
}

// This function adds a topic profile to a community and refreshes its centroid.
function addTopicToCommunity(community, topic) {
  if (community.topics.some(existing => existing.topicId === topic.topicId)) return;

  community.topics.push(topic);

  if (Array.isArray(topic.vector) && topic.vector.length) {
    community.samples.push({ vector: topic.vector, weight: topicMagnitude(topic.strength) });
    community.vector = weightedAverageVector(community.samples) || community.vector;
  }
}

// This function prepares debug output showing the strongest topic affinity pairs.
function topBehavioralAffinityPairs(topicProfiles, limit = 8) {
  const pairs = [];

  for (let i = 0; i < topicProfiles.length; i++) {
    for (let j = i + 1; j < topicProfiles.length; j++) {
      const a = topicProfiles[i];
      const b = topicProfiles[j];
      const affinity = behavioralAffinityScore(a, b);

      pairs.push({
        topicAId: a.topicId,
        topicAName: a.name,
        topicBId: b.topicId,
        topicBName: b.name,
        affinity: Number(affinity.toFixed(4))
      });
    }
  }

  return pairs
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, Math.max(0, limit));
}

// This function summarizes island communities for debug logging.
function summarizeIslandCommunities(communities) {
  return communities.map((community, index) => ({
    index: index + 1,
    weight: Number(community.weight || 0),
    label: community.label,
    topicMembers: community.topics
      .slice()
      .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId))
      .map(topic => ({
        topicId: topic.topicId,
        name: topic.name,
        strength: Number((topic.strength || 0).toFixed(4))
      }))
  }));
}

// This function clusters topic profiles into behaviorally related island communities.
function buildBehavioralTopicCommunities(topicProfiles, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER) {
  const sorted = topicProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId));

  const communities = [];
  const maxCommunitiesPerTopic = Math.max(1, DEFAULT_MAX_COMMUNITIES_PER_TOPIC);

  for (const topic of sorted) {
    if (!communities.length) {
      communities.push({
        topics: [topic],
        samples: Array.isArray(topic.vector) && topic.vector.length
          ? [{ vector: topic.vector, weight: topicMagnitude(topic.strength) }]
          : [],
        vector: Array.isArray(topic.vector) && topic.vector.length
          ? normalizeVector(topic.vector)
          : null
      });
      continue;
    }

    const rankedCommunities = communities
      .map(community => ({
        community,
        affinity: averageAffinityWithCommunity(topic, community.topics)
      }))
      .sort((a, b) => b.affinity - a.affinity);

    const eligibleCommunities = rankedCommunities
      .filter(item => item.affinity >= DEFAULT_TOPIC_AFFINITY_THRESHOLD)
      .slice(0, maxCommunitiesPerTopic);

    if (eligibleCommunities.length) {
      for (const item of eligibleCommunities) {
        addTopicToCommunity(item.community, topic);
      }
      continue;
    }

    const bestCommunity = rankedCommunities[0]?.community || null;

    if (communities.length >= maxIslands && bestCommunity) {
      addTopicToCommunity(bestCommunity, topic);
      continue;
    }

    communities.push({
      topics: [topic],
      samples: Array.isArray(topic.vector) && topic.vector.length
        ? [{ vector: topic.vector, weight: topicMagnitude(topic.strength) }]
        : [],
      vector: Array.isArray(topic.vector) && topic.vector.length
        ? normalizeVector(topic.vector)
        : null
    });
  }

  return communities
    .map(bucket => ({
      topics: bucket.topics,
      vector: weightedAverageVector(bucket.samples) || bucket.vector,
      weight: buildIslandWeight(bucket.topics),
      positiveSignals: buildIslandPositiveSignals(bucket.topics),
      label: buildIslandLabel(bucket.topics)
    }))
    .sort((a, b) => (b.weight - a.weight) || (b.topics.length - a.topics.length));
}

// This function builds article-based island profiles from direct user behavior.
export async function buildInterestIslandProfilesForUser(userId, options = {}) {
  const maxIslands = options.maxIslands || DEFAULT_MAX_ISLANDS_PER_USER;

  const articles = await Article.findAll({
    where: {
      userId,
      articleVector: { [Op.ne]: null },
      [Op.or]: [
        { starInd: 1 },
        { clickedAmount: { [Op.gt]: 0 } },
        { attentionBucket: { [Op.gte]: 3 } },
        { negativeInd: 1 }
      ]
    },
    attributes: [
      'id',
      'title',
      'articleVector',
      'starInd',
      'clickedAmount',
      'attentionBucket',
      'negativeInd',
      'published'
    ],
    order: [
      ['starInd', 'DESC'],
      ['clickedAmount', 'DESC'],
      ['attentionBucket', 'DESC'],
      ['published', 'DESC'],
      ['id', 'ASC']
    ]
  });

  const articleProfiles = articles
    .map(computeBehavioralArticleProfile)
    .filter(profile => Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => Math.abs(profile.score) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD);

  const communities = buildBehavioralArticleCommunities(articleProfiles, maxIslands);

  if (ISLAND_DEBUG) {
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

// This function builds topic-based island profiles from topics and their engaged articles.
export async function buildTopicInterestIslandProfilesForUser(userId, options = {}) {
  const maxIslands = options.maxIslands || DEFAULT_MAX_ISLANDS_PER_USER;

  const topics = await Topic.findAll({
    where: {
      userId,
      topicVector: { [Op.ne]: null }
    },
    include: [{
      model: Article,
      as: 'articles',
      required: false,
      attributes: ['id', 'starInd', 'clickedAmount', 'attentionBucket', 'negativeInd', 'published'],
      through: { attributes: [] }
    }],
    order: [
      ['affinityScore', 'DESC'],
      ['updatedAt', 'DESC'],
      ['id', 'ASC']
    ]
  });

  const topicProfiles = topics.map(computeTopicProfile);
  const communities = buildBehavioralTopicCommunities(topicProfiles, maxIslands);

  if (ISLAND_DEBUG) {
    debugIsland('behavioral-community-formation', {
      userId,
      topicCount: topicProfiles.length,
      maxIslands,
      affinityThreshold: DEFAULT_TOPIC_AFFINITY_THRESHOLD,
      topAffinityPairs: topBehavioralAffinityPairs(topicProfiles),
      finalCommunities: summarizeIslandCommunities(communities)
    });
  }

  return communities;
}

// This function creates, updates, archives, and links islands from computed profiles.
async function persistInterestIslandProfiles(userId, profiles, transaction, options = {}) {
  const topicConfidenceThreshold =
    options.topicConfidenceThreshold ?? DEFAULT_TOPIC_CONFIDENCE_THRESHOLD;

  const persistableProfiles = profiles
    .map(profile => ({
      ...profile,
      topics: (profile.topics || []).filter(topic => Math.abs(topic.strength) >= topicConfidenceThreshold)
    }))
    .filter(profile => Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => profile.topics.length > 0 || (profile.articles || []).length > 0);

  const existingIslands = await Island.findAll({
    where: { userId },
    order: [['weight', 'DESC'], ['id', 'ASC']],
    transaction
  });

  const taxonomyRows = await IslandTaxonomy.findAll({
    where: {
      status: 'active',
      vector: { [Op.ne]: null }
    },
    attributes: ['displayName', 'vector'],
    transaction
  });

  const matchedIslandIds = new Set();

  const createdIslands = [];
  let createdIslandCount = 0;
  let updatedIslandCount = 0;
  let updatedWithStarSignalCount = 0;
  let updatedWithClickSignalCount = 0;
  let updatedWithNegativeSignalCount = 0;

  for (const profile of persistableProfiles) {
    const taxonomyLabel = resolveTaxonomyDisplayName(profile.vector, taxonomyRows);
    const topicFallbackLabel = resolveTopicFallbackLabel(profile);
    const resolvedLabel = taxonomyLabel || topicFallbackLabel || profile.label || 'Interest Island';

    let bestMatch = null;
    let bestSimilarity = 0;

    for (const island of existingIslands) {
      if (matchedIslandIds.has(island.id)) continue;

      const similarity = cosineSimilarity(profile.vector, island.islandVector);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = island;
      }
    }

    const islandRows = profile.topics
      .map(topic => {
        const similarity = cosineSimilarity(profile.vector, topic.vector);
        return {
          topicId: topic.topicId,
          similarity: Number(similarity.toFixed(4)),
          confidence: Number(clamp(Math.abs(topic.strength) * similarity, 0, 1).toFixed(4))
        };
      })
      .filter(row => row.confidence >= topicConfidenceThreshold);

    const topicIds = islandRows.map(row => Number(row.topicId));
    const articleIds = (profile.articles || [])
      .map(article => Number(article.articleId))
      .filter(Number.isFinite);
    const auditEntry = await buildPopulationAuditEntry({
      userId,
      topicIds,
      articleIds,
      transaction
    });

    if (bestMatch && bestSimilarity >= DEFAULT_ISLAND_MATCH_THRESHOLD) {
      const updatedIsland = await bestMatch.update({
        label: resolvedLabel,
        weight: profile.weight,
        islandVector: blendIslandVector(bestMatch.islandVector, profile.vector),
        positiveSignals: mergePositiveSignals(bestMatch.positiveSignals, profile.positiveSignals),
        populationAudit: appendPopulationAudit(bestMatch.populationAudit, auditEntry),
        archivedInd: false,
        archivedAt: null
      }, { transaction });

      matchedIslandIds.add(updatedIsland.id);
      updatedIslandCount += 1;

      if (Number(profile?.positiveSignals?.stars || 0) > 0) {
        updatedWithStarSignalCount += 1;
      }
      if (Number(profile?.positiveSignals?.clicks || 0) > 0) {
        updatedWithClickSignalCount += 1;
      }
      if (Number(profile?.positiveSignals?.negatives || 0) > 0) {
        updatedWithNegativeSignalCount += 1;
      }

      if (islandRows.length) {
        await evolveIslandTopicMemberships(updatedIsland.id, islandRows, transaction);
      }

      createdIslands.push(updatedIsland);
      continue;
    }

    const island = await Island.create({
      label: resolvedLabel,
      weight: profile.weight,
      userId,
      islandVector: profile.vector,
      positiveSignals: normalizePositiveSignals(profile.positiveSignals),
      populationAudit: appendPopulationAudit([], auditEntry),
      archivedInd: false,
      archivedAt: null
    }, { transaction });
    createdIslandCount += 1;

    if (islandRows.length) {
      await IslandTopic.bulkCreate(
        islandRows.map(row => ({
          islandId: island.id,
          topicId: row.topicId,
          similarity: row.similarity,
          confidence: row.confidence
        })),
        { transaction }
      );
    }

    createdIslands.push(island);
  }

  const inactiveIslands = existingIslands.filter(island => !matchedIslandIds.has(island.id));
  const inactiveIds = inactiveIslands.map(island => island.id);

  if (inactiveIds.length) {
    const confidenceRows = await IslandTopic.findAll({
      where: {
        islandId: { [Op.in]: inactiveIds }
      },
      attributes: [
        'islandId',
        [sequelize.fn('AVG', sequelize.col('confidence')), 'avgConfidence']
      ],
      group: ['islandId'],
      raw: true,
      transaction
    });

    const avgConfidenceByIslandId = new Map(
      confidenceRows.map(row => [Number(row.islandId), Number(row.avgConfidence || 0)])
    );

    const now = new Date();

    for (const island of inactiveIslands) {
      const noActivity = true;
      const lowConfidence = (avgConfidenceByIslandId.get(Number(island.id)) || 0) < DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD;
      const staleAge = isStaleIsland(island);

      if (noActivity && lowConfidence && staleAge) {
        await island.update(
          {
            archivedInd: true,
            archivedAt: now
          },
          { transaction }
        );
      }
    }
  }

  if (ISLAND_DEBUG) {
    debugIsland('island-persistence-summary', {
      userId,
      createdIslandCount,
      updatedIslandCount,
      updatedBySignals: {
        stars: updatedWithStarSignalCount,
        clicks: updatedWithClickSignalCount,
        negativeInd: updatedWithNegativeSignalCount
      }
    });
  }

  return createdIslands;
}

// This function builds and persists behavior-derived islands for one user.
export async function buildInterestIslandsFromBehaviorForUser(userId, options = {}) {
  const profiles = await buildInterestIslandProfilesForUser(userId, options);

  const islands = await sequelize.transaction((transaction) =>
    persistInterestIslandProfiles(userId, profiles, transaction, options)
  );

  return {
    userId,
    islandCount: islands.length,
    articleCount: profiles.reduce((sum, profile) => sum + (profile.articles || []).length, 0),
    profiles
  };
}

// This function builds behavior-derived islands for one user or every user.
export async function buildInterestIslandsFromBehavior(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  if (userId) {
    return buildInterestIslandsFromBehaviorForUser(userId, { ...options, maxIslands });
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  const results = [];

  for (const user of users) {
    try {
      const result = await buildInterestIslandsFromBehaviorForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      console.error(`[ISLANDS] Failed building interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

// This function enriches existing islands with topic memberships based on vector similarity.
export async function enrichInterestIslandsFromTopicsForUser(userId, options = {}) {
  const topicConfidenceThreshold =
    options.topicConfidenceThreshold ?? DEFAULT_TOPIC_CONFIDENCE_THRESHOLD;

  return sequelize.transaction(async (transaction) => {
    const [islands, topicProfiles, taxonomyRows] = await Promise.all([
      Island.findAll({
        where: { userId, archivedInd: false, islandVector: { [Op.ne]: null } },
        order: [['weight', 'DESC'], ['id', 'ASC']],
        transaction
      }),
      buildTopicInterestIslandProfilesForUser(userId, options),
      IslandTaxonomy.findAll({
        where: {
          status: 'active',
          vector: { [Op.ne]: null }
        },
        attributes: ['displayName', 'vector'],
        transaction
      })
    ]);

    let enrichedIslandCount = 0;
    let islandTopicLinkCount = 0;

    for (const island of islands) {
      const candidateTopicRows = topicProfiles
        .flatMap(profile => profile.topics || [])
        .filter(topic => Array.isArray(topic.vector) && topic.vector.length)
        .map(topic => {
          const similarity = cosineSimilarity(island.islandVector, topic.vector);
          const evidence = clamp(
            Math.abs(Number(topic.strength || 0)) + Math.min(Number(topic.evidenceCount || 0), 5) * 0.04,
            0.25,
            1
          );

          return {
            topicId: topic.topicId,
            similarity: Number(similarity.toFixed(4)),
            confidence: Number(clamp(similarity * evidence, 0, 1).toFixed(4))
          };
        })
        .filter(row =>
          row.similarity >= DEFAULT_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD &&
          row.confidence >= topicConfidenceThreshold
        );
      const topicRowsById = new Map();

      for (const row of candidateTopicRows) {
        const topicId = Number(row.topicId);
        const previous = topicRowsById.get(topicId);
        if (!previous || row.confidence > previous.confidence) {
          topicRowsById.set(topicId, row);
        }
      }

      const topicRows = [...topicRowsById.values()];

      if (!topicRows.length) continue;

      await evolveIslandTopicMemberships(island.id, topicRows, transaction);

      const matchedTopicIds = new Set(topicRows.map(row => Number(row.topicId)));
      const matchedTopics = topicProfiles
        .flatMap(profile => profile.topics || [])
        .filter(topic => matchedTopicIds.has(Number(topic.topicId)));
      const labelProfile = {
        vector: island.islandVector,
        topics: matchedTopics
      };
      const taxonomyLabel = resolveTaxonomyDisplayName(island.islandVector, taxonomyRows);
      const topicFallbackLabel = resolveTopicFallbackLabel(labelProfile);
      const resolvedLabel = taxonomyLabel || topicFallbackLabel || island.label;

      await island.update(
        {
          label: resolvedLabel,
          populationAudit: appendPopulationAudit(
            island.populationAudit,
            await buildPopulationAuditEntry({
              userId,
              topicIds: [...matchedTopicIds],
              transaction
            })
          )
        },
        { transaction }
      );

      enrichedIslandCount += 1;
      islandTopicLinkCount += topicRows.length;
    }

    return {
      userId,
      enrichedIslandCount,
      islandTopicLinkCount
    };
  });
}

// This function enriches islands from topics for one user or every user.
export async function enrichInterestIslandsFromTopics(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  if (userId) {
    return enrichInterestIslandsFromTopicsForUser(userId, { ...options, maxIslands });
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  const results = [];

  for (const user of users) {
    try {
      const result = await enrichInterestIslandsFromTopicsForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      console.error(`[ISLANDS] Failed enriching interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

// This function runs the full island pipeline for one user and refreshes article interest scores.
export async function buildInterestIslandsForUser(userId, options = {}) {
  const behaviorResult = await buildInterestIslandsFromBehaviorForUser(userId, options);
  const enrichmentResult = await enrichInterestIslandsFromTopicsForUser(userId, options);
  const scoringResult = await buildArticleInterestScoresForUser(userId);

  return {
    userId,
    islandCount: behaviorResult.islandCount,
    articleCount: behaviorResult.articleCount,
    enrichedIslandCount: enrichmentResult.enrichedIslandCount,
    islandTopicLinkCount: enrichmentResult.islandTopicLinkCount,
    topicScoredCount: Number(scoringResult?.topicScoredCount || 0),
    fallbackScoredCount: Number(scoringResult?.fallbackScoredCount || 0),
    rescoredArticleCount: Number(scoringResult?.updatedCount || 0),
    profiles: behaviorResult.profiles
  };
}

// This function runs the full island pipeline for one user or every user.
export async function buildInterestIslands(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  if (userId) {
    return buildInterestIslandsForUser(userId, { ...options, maxIslands });
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  const results = [];

  for (const user of users) {
    try {
      const result = await buildInterestIslandsForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      console.error(`[ISLANDS] Failed building interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

export default buildInterestIslands;
