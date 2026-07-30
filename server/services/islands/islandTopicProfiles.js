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

// Provides the shared dependencies used by this service.
const { Topic, Article } = db;

// This function converts a topic and its article behavior into an island clustering profile.
function computeTopicProfile(topic) {
  // Derives the articles required while computing topic profile.
  const articles = topic.articles || [];
  // Builds the positive signals accumulator while computing topic profile.
  const positiveSignals = buildPositiveSignalsAccumulator();
  // Derives the engagement by article id required while computing topic profile.
  const engagementByArticleId = new Map();
  // Derives the engagement by time bucket required while computing topic profile.
  const engagementByTimeBucket = new Map();
  let rawScore = 0;
  let evidenceCount = 0;

  // Processes each articles entry in turn.
  for (const article of articles) {
    // Computes the article signals while computing topic profile.
    const articleSignals = computeArticleSignals(article);
    addPositiveSignals(positiveSignals, articleSignals.positiveSignals);
    rawScore += articleSignals.positiveScore;
    rawScore -= articleSignals.negativeScore;

    // Coerces the article id into the representation required while computing topic profile.
    const articleId = Number(article.id);
    // Handles the case where article id is finite and article signals engagement score exceeds value.
    if (Number.isFinite(articleId) && articleSignals.engagementScore > 0) {
      engagementByArticleId.set(
        articleId,
        (engagementByArticleId.get(articleId) || 0) + articleSignals.engagementScore
      );

      // Selects the published ts based on whether article published at is available.
      const publishedTs = article.publishedAt ? new Date(article.publishedAt).getTime() : null;
      // Handles the case where published ts is finite.
      if (Number.isFinite(publishedTs)) {
        // Derives the bucket ms required while computing topic profile.
        const bucketMs = Math.max(1, DEFAULT_ENGAGEMENT_TIME_BUCKET_HOURS) * 60 * 60 * 1000;
        // Derives the bucket through floor while computing topic profile.
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

  // Derives the denominator through max while computing topic profile.
  const denominator = Math.max(1, (topic.articleCount || evidenceCount || 1) * 6);
  // Derives the strength through clamp while computing topic profile.
  const strength = clamp(rawScore / denominator, -1, 1);

  // Selects the result based on whether topic topic vector is an array.
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
  // Keeps the names entries eligible while building island label.
  const names = topicProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId))
    .map(topic => topic.name)
    .filter(Boolean);

  // Returns early when names is empty.
  if (!names.length) return 'Interest Island';
  // Returns early when names count is 1.
  if (names.length === 1) return names[0].slice(0, 255);

  return `${names[0]} / ${names[1]}`.slice(0, 255);
}

// This function computes island weight from topic strengths plus a breadth bonus.
function buildIslandWeight(topicProfiles) {
  // Returns early when topic profiles is empty.
  if (!topicProfiles.length) return 0;

  // Derives the average strength required while building island weight.
  const averageStrength = topicProfiles.reduce((sum, topic) => sum + topic.strength, 0) / topicProfiles.length;
  // Derives the breadth bonus required while building island weight.
  const breadthBonus = Math.sign(averageStrength) * Math.min(0.2, topicProfiles.length * 0.03);

  return Number(clamp(averageStrength + breadthBonus, -1, 1).toFixed(4));
}

// This function totals positive signal counters across topic profiles.
function buildIslandPositiveSignals(topicProfiles) {
  // Builds the positive signals accumulator while building island positive signals.
  const signals = buildPositiveSignalsAccumulator();

  // Processes each topic profiles entry in turn.
  for (const topic of topicProfiles) {
    addPositiveSignals(signals, topic.positiveSignals);
  }

  return signals;
}

// This function compares two weighted engagement maps with weighted Jaccard similarity.
function weightedJaccardSimilarity(scoresA, scoresB) {
  // Returns early when scores a is unavailable or scores b is unavailable.
  if (!(scoresA instanceof Map) || !(scoresB instanceof Map)) return 0;
  // Returns early when scores a size is unavailable or scores b size is unavailable.
  if (!scoresA.size || !scoresB.size) return 0;

  // Tracks distinct keys while performing weighted jaccard similarity.
  const keys = new Set([...scoresA.keys(), ...scoresB.keys()]);
  // Returns early when keys size is unavailable.
  if (!keys.size) return 0;

  let intersection = 0;
  let union = 0;

  // Processes each keys entry in turn.
  for (const articleId of keys) {
    // Coerces the value a into the representation required while performing weighted jaccard similarity.
    const valueA = Number(scoresA.get(articleId) || 0);
    // Coerces the value b into the representation required while performing weighted jaccard similarity.
    const valueB = Number(scoresB.get(articleId) || 0);

    intersection += Math.min(valueA, valueB);
    union += Math.max(valueA, valueB);
  }

  // Returns early when union is unavailable.
  if (!union) return 0;
  return clamp(intersection / union, 0, 1);
}

// This function scores topic affinity from shared article engagement and temporal behavior.
function behavioralAffinityScore(topicA, topicB) {
  // Derives the article overlap affinity through weighted jaccard similarity while performing behavioral affinity score.
  const articleOverlapAffinity = weightedJaccardSimilarity(
    topicA?.engagementByArticleId,
    topicB?.engagementByArticleId
  );

  // Derives the temporal pattern affinity through weighted jaccard similarity while performing behavioral affinity score.
  const temporalPatternAffinity = weightedJaccardSimilarity(
    topicA?.engagementByTimeBucket,
    topicB?.engagementByTimeBucket
  );

  // Derives the temporal weight through clamp while performing behavioral affinity score.
  const temporalWeight = clamp(DEFAULT_TEMPORAL_AFFINITY_WEIGHT, 0, 1);
  // Derives the article weight required while performing behavioral affinity score.
  const articleWeight = 1 - temporalWeight;

  return clamp(
    articleOverlapAffinity * articleWeight + temporalPatternAffinity * temporalWeight,
    0,
    1
  );
}

// This function computes a topic's average behavioral affinity with one community.
function averageAffinityWithCommunity(topic, communityTopics) {
  // Returns early when community topics is empty.
  if (!communityTopics.length) return 0;

  // Aggregates source values into the sum used while performing average affinity with community.
  const sum = communityTopics.reduce(
    (total, member) => total + behavioralAffinityScore(topic, member),
    0
  );

  return sum / communityTopics.length;
}

// This function adds a topic profile to a community and refreshes its centroid.
function addTopicToCommunity(community, topic) {
  // Avoids adding the same topic evidence to a community twice.
  if (community.topics.some(existing => existing.topicId === topic.topicId)) return;

  community.topics.push(topic);

  // Handles the case where topic vector is an array and topic vector is non-empty.
  if (Array.isArray(topic.vector) && topic.vector.length) {
    community.samples.push({ vector: topic.vector, weight: topicMagnitude(topic.strength) });
    community.vector = weightedAverageVector(community.samples) || community.vector;
  }
}

// This function prepares debug output showing the strongest topic affinity pairs.
function topBehavioralAffinityPairs(topicProfiles, limit = 8) {
  // Collects the pairs while performing top behavioral affinity pairs.
  const pairs = [];

  // Repeats this processing step while eligible work remains.
  for (let i = 0; i < topicProfiles.length; i++) {
    // Repeats this processing step while eligible work remains.
    for (let j = i + 1; j < topicProfiles.length; j++) {
      const a = topicProfiles[i];
      const b = topicProfiles[j];
      // Derives the affinity through behavioral affinity score while performing top behavioral affinity pairs.
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

  // Orders values deterministically while performing top behavioral affinity pairs.
  return pairs
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, Math.max(0, limit));
}

// This function summarizes island communities for debug logging.
function summarizeIslandCommunities(communities) {
  // Maps source values into the result produced while performing summarize island communities.
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
  // Derives the sorted through sort while building behavioral topic communities.
  const sorted = topicProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.strength) - Math.abs(a.strength)) || (a.topicId - b.topicId));

  // Collects the communities while building behavioral topic communities.
  const communities = [];
  // Derives the max communities per topic through max while building behavioral topic communities.
  const maxCommunitiesPerTopic = Math.max(1, DEFAULT_MAX_COMMUNITIES_PER_TOPIC);

  // Processes each sorted entry in turn.
  for (const topic of sorted) {
    // Handles the case where communities is empty.
    if (!communities.length) {
      // Selects the result based on whether topic vector is an array and topic vector is non-empty.
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

    // Derives the ranked communities through sort while building behavioral topic communities.
    const rankedCommunities = communities
      .map(community => ({
        community,
        affinity: averageAffinityWithCommunity(topic, community.topics)
      }))
      .sort((a, b) => b.affinity - a.affinity);

    // Derives the eligible communities through slice while building behavioral topic communities.
    const eligibleCommunities = rankedCommunities
      .filter(item => item.affinity >= DEFAULT_TOPIC_AFFINITY_THRESHOLD)
      .slice(0, maxCommunitiesPerTopic);

    // Handles the case where eligible communities is non-empty.
    if (eligibleCommunities.length) {
      // Processes each eligible communities entry in turn.
      for (const item of eligibleCommunities) {
        addTopicToCommunity(item.community, topic);
      }
      continue;
    }

    // Derives the best community required while building behavioral topic communities.
    const bestCommunity = rankedCommunities[0]?.community || null;

    // Handles the case where communities count reaches max islands and best community is available.
    if (communities.length >= maxIslands && bestCommunity) {
      addTopicToCommunity(bestCommunity, topic);
      continue;
    }

    // Selects the result based on whether topic vector is an array and topic vector is non-empty.
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

  // Maps source values into the result produced while building behavioral topic communities.
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
  // Derives the max islands required while building topic interest island profiles for user.
  const maxIslands = options.maxIslands || DEFAULT_MAX_ISLANDS_PER_USER;

  // Loads the topics needed while building topic interest island profiles for user.
  const topics = await Topic.findAll({
    where: {
      userId,
      topicVector: { [Op.ne]: null }
    },
    include: [{
      model: Article,
      as: 'articles',
      required: false,
      where: { userId },
      attributes: ['id', 'positiveInd', 'favoriteInd', 'clickedAmount', 'attentionBucket', 'negativeInd', 'publishedAt'],
      through: { attributes: [] }
    }],
    order: [
      ['affinityScore', 'DESC'],
      ['updatedAt', 'DESC'],
      ['id', 'ASC']
    ]
  });

  // Transforms source values into the topic profiles required while building topic interest island profiles for user.
  const topicProfiles = topics.map(computeTopicProfile);
  // Builds the behavioral topic communities while building topic interest island profiles for user.
  const communities = buildBehavioralTopicCommunities(topicProfiles, maxIslands);

  // Handles the case where island debug is available.
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
