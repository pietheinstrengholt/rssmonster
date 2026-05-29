import { Op } from 'sequelize';
import db from '../../models/index.js';
import { computeArticleSignals } from './islandArticleProfiles.js';
import {
  DEFAULT_ENGAGEMENT_TIME_BUCKET_HOURS,
  DEFAULT_MAX_COMMUNITIES_PER_TOPIC,
  DEFAULT_MAX_ISLANDS_PER_USER,
  DEFAULT_TEMPORAL_AFFINITY_WEIGHT,
  DEFAULT_TOPIC_AFFINITY_THRESHOLD,
  ISLAND_DEBUG,
  SIGNAL_WEIGHTS,
  addPositiveSignals,
  buildPositiveSignalsAccumulator,
  clamp,
  debugIsland,
  normalizeVector,
  topicMagnitude,
  weightedAverageVector
} from './islandVectorUtils.js';

const { Topic, Article } = db;

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
      attributes: ['id', 'positiveInd', 'starInd', 'clickedAmount', 'attentionBucket', 'negativeInd', 'published'],
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
