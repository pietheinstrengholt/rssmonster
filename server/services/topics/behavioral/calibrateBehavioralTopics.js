import { Op } from 'sequelize';
import { randomUUID } from 'node:crypto';
import db from '../../../models/index.js';
import { recordProcessingFailure } from '../../observability/processingFailures.js';
import { tryEnqueueGeneratedSemanticLabelJobsForUser } from '../../semanticLabels/semanticLabelJobs.js';
import { canonicalArticleWhere } from '../../duplicates/articleDuplicates.js';
import {
  blendTopicVectorWithAlpha,
  cosineSimilarity,
  generateTopicKey
} from '../shared/topicHelpers.js';
import {
  normalizeVector,
  weightedAverageVector
} from '../../vectors/index.js';

// Provides the shared dependencies used by this service.
const { Article, ArticleTopic, Topic } = db;

// This service calibrates durable behavioral topics from articles a user has explicitly engaged with.
// It uses the existing Topic and ArticleTopic tables so behavioral interests can coexist with event topics.

// Defines the signal weights enforced by this service.
const SIGNAL_WEIGHTS = {
  star: 4,
  click: 2,
  deepRead: 1
};

// Defines the default community similarity threshold enforced by this service.
const DEFAULT_COMMUNITY_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_COMMUNITY_SIMILARITY_THRESHOLD || '0.64'
);
// Defines the default topic match threshold enforced by this service.
const DEFAULT_TOPIC_MATCH_THRESHOLD = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_MATCH_THRESHOLD || '0.78'
);
// Defines the default engagement threshold enforced by this service.
const DEFAULT_ENGAGEMENT_THRESHOLD = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_ENGAGEMENT_THRESHOLD || '8'
);
// Defines the default vector blend alpha enforced by this service.
const DEFAULT_VECTOR_BLEND_ALPHA = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_VECTOR_ALPHA || '0.35'
);
// Defines the min articles per behavioral topic enforced by this service.
const MIN_ARTICLES_PER_BEHAVIORAL_TOPIC = 3;

// This helper keeps derived scores and blend weights inside a known numeric range.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// This function scores positive behavioral evidence for an article.
function engagementScore(article) {
  // Selects the stars based on whether article favorite status is 1.
  const stars = article.favoriteInd === 1 ? 1 : 0;
  // Derives the clicks through min while performing engagement score.
  const clicks = Math.min(Number(article.clickedAmount || 0), 3);
  // Selects the deep reads based on whether number reaches 3.
  const deepReads = Number(article.attentionBucket || 0) >= 3 ? 1 : 0;

  return (
    stars * SIGNAL_WEIGHTS.star +
    clicks * SIGNAL_WEIGHTS.click +
    deepReads * SIGNAL_WEIGHTS.deepRead
  );
}

// This function resolves the calendar day that contributes behavioral evidence.
function behaviorDay(article) {
  // Derives the value required while performing behavior day.
  const value = article.publishedAt || article.updatedAt || article.createdAt;
  // Returns no result when value is unavailable.
  if (!value) return null;

  return new Date(value).toISOString().slice(0, 10);
}

// This function converts an article model into a behavioral clustering profile.
function buildArticleProfile(article) {
  // Derives the score through engagement score while building article profile.
  const score = engagementScore(article);

  // Selects the result based on whether article article vector is an array.
  return {
    articleId: Number(article.id),
    feedId: Number(article.feedId),
    title: article.title,
    vector: Array.isArray(article.articleVector) ? article.articleVector : null,
    score,
    publishedAt: article.publishedAt,
    day: behaviorDay(article)
  };
}

// This function adds one article profile to an existing vector community.
function addArticleToCommunity(community, profile) {
  // Avoids adding the same article evidence to a community twice.
  if (community.articles.some(article => article.articleId === profile.articleId)) return;

  community.articles.push(profile);
  community.samples.push({ vector: profile.vector, weight: profile.score });
  community.vector = weightedAverageVector(community.samples) || community.vector;
}

// This function clusters engaged article vectors into behavioral communities.
function buildBehavioralCommunities(articleProfiles, similarityThreshold) {
  // Collects the communities while building behavioral communities.
  const communities = [];
  // Derives the sorted through sort while building behavioral communities.
  const sorted = articleProfiles
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.articleId - b.articleId));

  // Processes each sorted entry in turn.
  for (const profile of sorted) {
    // Derives the ranked through sort while building behavioral communities.
    const ranked = communities
      .map(community => ({
        community,
        similarity: cosineSimilarity(profile.vector, community.vector)
      }))
      .sort((a, b) => b.similarity - a.similarity);

    // Derives the best required while building behavioral communities.
    const best = ranked[0] || null;
    // Handles the case where best is available and best similarity reaches similarity threshold.
    if (best && best.similarity >= similarityThreshold) {
      addArticleToCommunity(best.community, profile);
      continue;
    }

    communities.push({
      articles: [profile],
      samples: [{ vector: profile.vector, weight: profile.score }],
      vector: normalizeVector(profile.vector)
    });
  }

  // Maps source values into the result produced while building behavioral communities.
  return communities
    .map(community => ({
      ...community,
      vector: weightedAverageVector(community.samples) || community.vector
    }))
    .sort((a, b) => (b.articles.length - a.articles.length) || (totalScore(b) - totalScore(a)));
}

// This function totals engagement evidence for a community.
function totalScore(community) {
  // Aggregates source values into the result produced while performing total score.
  return community.articles.reduce((sum, article) => sum + article.score, 0);
}

// This function checks whether evidence spans multiple feeds or days.
function hasBehavioralBreadth(community) {
  // Tracks distinct feed id while checking behavioral breadth.
  const feedIds = new Set(community.articles.map(article => article.feedId).filter(Boolean));
  // Tracks distinct days while checking behavioral breadth.
  const days = new Set(community.articles.map(article => article.day).filter(Boolean));

  return feedIds.size >= 2 || days.size >= 2;
}

// This function chooses a stable topic label from the strongest article title.
function topicNameForCommunity(community) {
  // Loads the title needed while performing topic name for community.
  const title = community.articles
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.articleId - b.articleId))
    .map(article => article.title)
    .find(Boolean);

  return (title || 'Behavioral Topic').slice(0, 255);
}

// This function finds the latest behavioral evidence timestamp in a community.
function lastBehaviorAt(community) {
  // Selects the timestamps based on whether article published at is available.
  const timestamps = community.articles
    .map(article => article.publishedAt ? new Date(article.publishedAt).getTime() : null)
    .filter(value => Number.isFinite(value));

  // Returns no result when timestamps is empty.
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

// This function builds the Topic payload for creating or updating a behavioral topic.
function topicPayload({ userId, community, existingTopic = null, vectorBlendAlpha }) {
  // Normalizes the incoming vector before performing topic payload.
  const incomingVector = normalizeVector(community.vector);
  // Selects the topic vector based on whether existing topic is available.
  const topicVector = existingTopic
    ? normalizeVector(blendTopicVectorWithAlpha(
      existingTopic.topicVector,
      incomingVector,
      clamp(vectorBlendAlpha, 0, 1)
    ))
    : incomingVector;

  // Selects the result based on whether topic type is hybrid.
  return {
    userId,
    name: existingTopic?.name || topicNameForCommunity(community),
    topicKey: existingTopic?.topicKey || generateTopicKey(topicVector) || `behavioral-${userId}-${Date.now()}`,
    topicType: existingTopic?.topicType === 'hybrid' ? 'hybrid' : 'behavioral',
    topicVector,
    evidenceScore: Number(totalScore(community).toFixed(4)),
    behavioralArticleCount: community.articles.length,
    lastBehaviorAt: lastBehaviorAt(community),
    lastActivityAt: lastBehaviorAt(community)
  };
}

// This function matches a behavioral community to an existing behavioral or hybrid topic.
function findBestExistingTopic(community, existingTopics, matchThreshold) {
  let best = null;

  // Processes each existing topics entry in turn.
  for (const topic of existingTopics) {
    // Derives the similarity through cosine similarity while finding best existing topic.
    const similarity = cosineSimilarity(community.vector, topic.topicVector);
    // Handles the case where best is unavailable or similarity exceeds best similarity.
    if (!best || similarity > best.similarity) {
      best = { topic, similarity };
    }
  }

  // Selects the result based on whether similarity reaches match threshold.
  return best?.similarity >= matchThreshold ? best : null;
}

// This function upserts article-topic evidence rows for a behavioral community.
async function upsertArticleTopicRows(topic, community, transaction) {
  // Transforms source values into the rows required while performing upsert article topic rows.
  const rows = community.articles.map(article => ({
    articleId: article.articleId,
    topicId: topic.id,
    confidence: Number(clamp(cosineSimilarity(article.vector, topic.topicVector), 0, 1).toFixed(4)),
    rank: 1,
    primaryInd: false
  }));

  await ArticleTopic.bulkCreate(rows, {
    updateOnDuplicate: ['confidence', 'rank', 'primaryInd'],
    transaction
  });

  return rows.length;
}

// This function removes stale article-topic evidence for pure behavioral topics.
async function cleanupStaleBehavioralArticleTopicRows(userId, activeRows, transaction) {
  // Loads the behavioral topics needed while performing cleanup stale behavioral article topic rows.
  const behavioralTopics = await Topic.findAll({
    where: {
      userId,
      topicType: 'behavioral'
    },
    attributes: ['id'],
    raw: true,
    transaction
  });

  // Keeps the behavioral topic id entries eligible while performing cleanup stale behavioral article topic rows.
  const behavioralTopicIds = behavioralTopics
    .map(topic => Number(topic.id))
    .filter(Number.isFinite);

  // Returns early when behavioral topic id is empty.
  if (!behavioralTopicIds.length) return 0;

  // Tracks distinct active keys while performing cleanup stale behavioral article topic rows.
  const activeKeys = new Set(
    activeRows.map(row => `${Number(row.topicId)}:${Number(row.articleId)}`)
  );

  // Loads the existing rows needed while performing cleanup stale behavioral article topic rows.
  const existingRows = await ArticleTopic.findAll({
    where: {
      topicId: { [Op.in]: behavioralTopicIds }
    },
    attributes: ['id', 'articleId', 'topicId'],
    raw: true,
    transaction
  });

  // Keeps the stale row id entries eligible while performing cleanup stale behavioral article topic rows.
  const staleRowIds = existingRows
    .filter(row => !activeKeys.has(`${Number(row.topicId)}:${Number(row.articleId)}`))
    .map(row => Number(row.id))
    .filter(Number.isFinite);

  // Returns early when stale row id is empty.
  if (!staleRowIds.length) return 0;

  return ArticleTopic.destroy({
    where: {
      id: { [Op.in]: staleRowIds }
    },
    transaction
  });
}

// This function calibrates behavioral topics for one user's engaged articles.
async function calibrateBehavioralTopicsForUserInternal(userId, options = {}) {
  // Resolves the community similarity threshold that governs performing calibrate behavioral topics for user.
  const communitySimilarityThreshold =
    options.communitySimilarityThreshold ?? DEFAULT_COMMUNITY_SIMILARITY_THRESHOLD;
  // Resolves the topic match threshold that governs performing calibrate behavioral topics for user.
  const topicMatchThreshold = options.topicMatchThreshold ?? DEFAULT_TOPIC_MATCH_THRESHOLD;
  // Resolves the engagement threshold that governs performing calibrate behavioral topics for user.
  const engagementThreshold = options.engagementThreshold ?? DEFAULT_ENGAGEMENT_THRESHOLD;
  // Derives the vector blend alpha required while performing calibrate behavioral topics for user.
  const vectorBlendAlpha = options.vectorBlendAlpha ?? DEFAULT_VECTOR_BLEND_ALPHA;

  // Loads the articles needed while performing calibrate behavioral topics for user.
  const articles = await Article.findAll({
    where: {
      userId,
      ...canonicalArticleWhere(),
      articleVector: { [Op.ne]: null },
      [Op.or]: [
        { favoriteInd: 1 },
        { clickedAmount: { [Op.gt]: 0 } },
        { attentionBucket: { [Op.gte]: 3 } }
      ]
    },
    attributes: [
      'id',
      'feedId',
      'title',
      'articleVector',
      'favoriteInd',
      'clickedAmount',
      'attentionBucket',
      'publishedAt',
      'createdAt',
      'updatedAt'
    ],
    order: [
      ['favoriteInd', 'DESC'],
      ['clickedAmount', 'DESC'],
      ['attentionBucket', 'DESC'],
      ['publishedAt', 'DESC'],
      ['id', 'ASC']
    ]
  });

  // Keeps the profiles entries eligible while performing calibrate behavioral topics for user.
  const profiles = articles
    .map(buildArticleProfile)
    .filter(profile => Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => profile.score > 0);

  // Keeps the communities entries eligible while performing calibrate behavioral topics for user.
  const communities = buildBehavioralCommunities(profiles, communitySimilarityThreshold)
    .filter(community => community.articles.length >= MIN_ARTICLES_PER_BEHAVIORAL_TOPIC)
    .filter(community => totalScore(community) >= engagementThreshold)
    .filter(hasBehavioralBreadth);

  // Handles the case where communities is empty.
  if (!communities.length) {
    // Derives the stale article topic link count through transaction while performing calibrate behavioral topics for user.
    const staleArticleTopicLinkCount = await db.sequelize.transaction(transaction =>
      cleanupStaleBehavioralArticleTopicRows(userId, [], transaction)
    );

    // Selects the result based on whether profiles is non-empty.
    return {
      topicCount: 0,
      articleTopicLinkCount: 0,
      staleArticleTopicLinkCount,
      touchedTopicIds: [],
      createdTopicIds: [],
      communitiesConsidered: profiles.length ? buildBehavioralCommunities(profiles, communitySimilarityThreshold).length : 0
    };
  }

  // Loads the existing topics needed while performing calibrate behavioral topics for user.
  const existingTopics = await Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: ['behavioral', 'hybrid'] },
      topicVector: { [Op.ne]: null }
    },
    order: [['lastBehaviorAt', 'DESC'], ['updatedAt', 'DESC'], ['id', 'ASC']]
  });

  let topicCount = 0;
  let articleTopicLinkCount = 0;
  let staleArticleTopicLinkCount = 0;
  // Collects the touched topic id while performing calibrate behavioral topics for user.
  const touchedTopicIds = [];
  const createdTopicIds = [];
  // Collects the active article topic rows while performing calibrate behavioral topics for user.
  const activeArticleTopicRows = [];

  // Runs the callback required while performing calibrate behavioral topics for user.
  await db.sequelize.transaction(async transaction => {
    // Processes each communities entry in turn.
    for (const community of communities) {
      // Finds the best existing topic while performing calibrate behavioral topics for user.
      const best = findBestExistingTopic(community, existingTopics, topicMatchThreshold);
      // Derives the payload through topic payload while performing calibrate behavioral topics for user.
      const payload = topicPayload({
        userId,
        community,
        existingTopic: best?.topic,
        vectorBlendAlpha
      });

      // Selects the topic based on whether best is available.
      const topic = best
        ? await best.topic.update(payload, { transaction })
        : await Topic.create(payload, { transaction });

      // Handles the case where best is unavailable.
      if (!best) {
        existingTopics.push(topic);
        createdTopicIds.push(Number(topic.id));
      }

      articleTopicLinkCount += await upsertArticleTopicRows(topic, community, transaction);
      touchedTopicIds.push(Number(topic.id));
      // Maps source values into the result produced while performing calibrate behavioral topics for user.
      activeArticleTopicRows.push(...community.articles.map(article => ({
        articleId: article.articleId,
        topicId: topic.id
      })));
      topicCount++;
    }

    staleArticleTopicLinkCount = await cleanupStaleBehavioralArticleTopicRows(
      userId,
      activeArticleTopicRows,
      transaction
    );
  });

  return {
    topicCount,
    articleTopicLinkCount,
    staleArticleTopicLinkCount,
    touchedTopicIds,
    createdTopicIds,
    communitiesConsidered: communities.length
  };
}

// Runs behavioral topic calibration while retaining its terminal failure for diagnosis.
export async function calibrateBehavioralTopicsForUser(userId, options = {}) {
  try {
    const result = await calibrateBehavioralTopicsForUserInternal(userId, options);
    if (result.createdTopicIds.length) {
      await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, {
        topicIds: result.createdTopicIds
      });
    }
    return result;
  } catch (error) {
    await recordProcessingFailure({
      crawlRunId: options.processingContext?.crawlRunId || null,
      executionId: options.processingContext?.executionId || randomUUID(),
      userId,
      stage: 'behavioral_topics',
      severity: 'FATAL',
      error,
      subjectType: 'user',
      subjectId: userId
    });
    throw error;
  }
}

// This function runs behavioral topic generation from a simple options object.
export async function calibrateBehavioralTopics(options = {}) {
  const { userId } = options;
  // Rejects processing when user id is unavailable.
  if (!userId) throw new Error('calibrateBehavioralTopics requires a userId');

  return calibrateBehavioralTopicsForUser(userId, options);
}

export default calibrateBehavioralTopics;
