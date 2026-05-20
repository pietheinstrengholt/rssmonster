import { Op } from 'sequelize';
import db from '../../models/index.js';

const { User, Topic, Article, Island, IslandTopic, sequelize } = db;

const DEFAULT_MAX_ISLANDS_PER_USER = Number.parseInt(process.env.MAX_INTEREST_ISLANDS, 10) || 10;
const DEFAULT_TOPIC_SIMILARITY_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_SIMILARITY_THRESHOLD || '0.88');
const DEFAULT_TOPIC_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.ISLAND_TOPIC_CONFIDENCE_THRESHOLD || '0.10');
const DEFAULT_RECENCY_HALF_LIFE_DAYS = Number.parseFloat(process.env.ISLAND_RECENCY_HALF_LIFE_DAYS || '30');

const SIGNAL_WEIGHTS = {
  star: 4,
  click: 1.5,
  deepRead: 3,
  open: 0.35,
  negative: 4,
  topicAffinity: 2,
  eventCount: 0.25
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

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

function topicRecencyWeight(publishedAt) {
  if (!publishedAt) return 1;

  const ageDays = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24));
  return Math.exp(-ageDays / DEFAULT_RECENCY_HALF_LIFE_DAYS);
}

function buildPositiveSignalsAccumulator() {
  return {
    stars: 0,
    clicks: 0,
    deepReads: 0
  };
}

function addPositiveSignals(target, source) {
  target.stars += source.stars;
  target.clicks += source.clicks;
  target.deepReads += source.deepReads;
}

function computeArticleSignals(article) {
  const stars = article.starInd === 1 ? 1 : 0;
  const clicks = Math.min(article.clickedAmount || 0, 3);
  const deepReads = (article.attentionBucket || 0) >= 3 ? 1 : 0;
  const opens = Math.min(article.openedCount || 0, 3);
  const negative = article.negativeInd === 1 ? 1 : 0;
  const recency = topicRecencyWeight(article.published);

  const positiveScore = (
    stars * SIGNAL_WEIGHTS.star +
    clicks * SIGNAL_WEIGHTS.click +
    deepReads * SIGNAL_WEIGHTS.deepRead +
    opens * SIGNAL_WEIGHTS.open
  ) * recency;

  const negativeScore = negative * SIGNAL_WEIGHTS.negative;

  return {
    positiveScore,
    negativeScore,
    positiveSignals: {
      stars,
      clicks,
      deepReads
    }
  };
}

function computeTopicProfile(topic) {
  const articles = topic.articles || [];
  const positiveSignals = buildPositiveSignalsAccumulator();
  let rawScore = 0;
  let evidenceCount = 0;

  for (const article of articles) {
    const articleSignals = computeArticleSignals(article);
    addPositiveSignals(positiveSignals, articleSignals.positiveSignals);
    rawScore += articleSignals.positiveScore;
    rawScore -= articleSignals.negativeScore;
    evidenceCount += 1;
  }

  rawScore += clamp(Number(topic.affinityScore || 0), 0, 1) * SIGNAL_WEIGHTS.topicAffinity;
  rawScore += Math.min(topic.eventCount || 0, 12) * SIGNAL_WEIGHTS.eventCount;

  const denominator = Math.max(1, (topic.articleCount || evidenceCount || 1) * 6);
  const strength = clamp(rawScore / denominator, 0, 1);

  return {
    topicId: topic.id,
    name: topic.name,
    vector: Array.isArray(topic.topicVector) ? topic.topicVector : null,
    strength,
    evidenceCount,
    positiveSignals
  };
}

function buildIslandLabel(topicProfiles) {
  const names = topicProfiles
    .slice()
    .sort((a, b) => (b.strength - a.strength) || (a.topicId - b.topicId))
    .map(topic => topic.name)
    .filter(Boolean);

  if (!names.length) return 'Interest Island';
  if (names.length === 1) return names[0].slice(0, 255);

  return `${names[0]} / ${names[1]}`.slice(0, 255);
}

function buildIslandWeight(topicProfiles) {
  if (!topicProfiles.length) return 0;

  const averageStrength = topicProfiles.reduce((sum, topic) => sum + topic.strength, 0) / topicProfiles.length;
  const breadthBonus = Math.min(0.2, topicProfiles.length * 0.03);

  return Number(clamp(averageStrength + breadthBonus, 0, 1).toFixed(4));
}

function buildIslandPositiveSignals(topicProfiles) {
  const signals = buildPositiveSignalsAccumulator();

  for (const topic of topicProfiles) {
    addPositiveSignals(signals, topic.positiveSignals);
  }

  return signals;
}

function assignTopicsToIslandBuckets(topicProfiles, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER) {
  const sorted = topicProfiles
    .slice()
    .filter(topic => Array.isArray(topic.vector) && topic.vector.length)
    .sort((a, b) => (b.strength - a.strength) || (a.topicId - b.topicId));

  const buckets = [];

  for (const topic of sorted) {
    let bestBucket = null;
    let bestSimilarity = 0;

    for (const bucket of buckets) {
      const similarity = cosineSimilarity(topic.vector, bucket.vector);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestBucket = bucket;
      }
    }

    const shouldAttachToBucket = bestBucket && bestSimilarity >= DEFAULT_TOPIC_SIMILARITY_THRESHOLD;

    if (shouldAttachToBucket) {
      bestBucket.topics.push(topic);
      bestBucket.samples.push({ vector: topic.vector, weight: topic.strength || 0.0001 });
      bestBucket.vector = weightedAverageVector(bestBucket.samples) || bestBucket.vector;
      continue;
    }

    if (buckets.length >= maxIslands && bestBucket) {
      bestBucket.topics.push(topic);
      bestBucket.samples.push({ vector: topic.vector, weight: topic.strength || 0.0001 });
      bestBucket.vector = weightedAverageVector(bestBucket.samples) || bestBucket.vector;
      continue;
    }

    buckets.push({
      topics: [topic],
      samples: [{ vector: topic.vector, weight: topic.strength || 0.0001 }],
      vector: normalizeVector(topic.vector)
    });
  }

  return buckets
    .map(bucket => ({
      topics: bucket.topics,
      vector: weightedAverageVector(bucket.samples) || bucket.vector,
      weight: buildIslandWeight(bucket.topics),
      positiveSignals: buildIslandPositiveSignals(bucket.topics),
      label: buildIslandLabel(bucket.topics)
    }))
    .sort((a, b) => (b.weight - a.weight) || (b.topics.length - a.topics.length));
}

export async function buildInterestIslandProfilesForUser(userId, options = {}) {
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
      attributes: ['id', 'starInd', 'clickedAmount', 'openedCount', 'attentionBucket', 'negativeInd', 'published'],
      through: { attributes: [] }
    }],
    order: [
      ['affinityScore', 'DESC'],
      ['updatedAt', 'DESC'],
      ['id', 'ASC']
    ]
  });

  const topicProfiles = topics.map(computeTopicProfile);
  return assignTopicsToIslandBuckets(topicProfiles, maxIslands);
}

async function persistInterestIslandProfiles(userId, profiles, transaction) {
  const persistableProfiles = profiles
    .map(profile => ({
      ...profile,
      topics: profile.topics.filter(topic => topic.strength >= DEFAULT_TOPIC_CONFIDENCE_THRESHOLD)
    }))
    .filter(profile => profile.topics.length > 0);

  await Island.destroy({
    where: { userId },
    transaction
  });

  const createdIslands = [];

  for (const profile of persistableProfiles) {
    const island = await Island.create({
      label: profile.label,
      weight: profile.weight,
      userId,
      islandVector: profile.vector,
      positiveSignals: profile.positiveSignals
    }, { transaction });

    createdIslands.push(island);

    await IslandTopic.bulkCreate(
      profile.topics
        .map((topic, index) => ({
        islandId: island.id,
        topicId: topic.topicId,
        similarity: Number(cosineSimilarity(profile.vector, topic.vector).toFixed(4)),
        confidence: Number(clamp(topic.strength * cosineSimilarity(profile.vector, topic.vector), 0, 1).toFixed(4))
      }))
        .filter(row => row.confidence >= DEFAULT_TOPIC_CONFIDENCE_THRESHOLD),
      { transaction }
    );
  }

  return createdIslands;
}

export async function buildInterestIslandsForUser(userId, options = {}) {
  const profiles = await buildInterestIslandProfilesForUser(userId, options);

  const createdIslands = await sequelize.transaction(async (transaction) =>
    persistInterestIslandProfiles(userId, profiles, transaction)
  );

  return {
    userId,
    islandCount: createdIslands.length,
    topicCount: profiles.reduce((sum, profile) => sum + profile.topics.length, 0),
    profiles
  };
}

export async function buildInterestIslands(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  if (userId) {
    return buildInterestIslandsForUser(userId, { maxIslands });
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  const results = [];

  for (const user of users) {
    try {
      const result = await buildInterestIslandsForUser(user.id, { maxIslands });
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
