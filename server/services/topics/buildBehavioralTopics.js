import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  blendTopicVectorWithAlpha,
  cosineSimilarity,
  generateTopicKey
} from './topicHelpers.js';
import {
  normalizeVector,
  weightedAverageVector
} from '../vectors/index.js';

const { Article, ArticleTopic, Topic } = db;

// This service builds durable behavioral topics from articles a user has explicitly engaged with.
// It uses the existing Topic and ArticleTopic tables so behavioral interests can coexist with event topics.

const SIGNAL_WEIGHTS = {
  star: 4,
  click: 1.5,
  deepRead: 3
};

const DEFAULT_COMMUNITY_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_COMMUNITY_SIMILARITY_THRESHOLD || '0.64'
);
const DEFAULT_TOPIC_MATCH_THRESHOLD = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_MATCH_THRESHOLD || '0.78'
);
const DEFAULT_ENGAGEMENT_THRESHOLD = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_ENGAGEMENT_THRESHOLD || '8'
);
const DEFAULT_VECTOR_BLEND_ALPHA = Number.parseFloat(
  process.env.BEHAVIORAL_TOPIC_VECTOR_ALPHA || '0.35'
);
const MIN_ARTICLES_PER_BEHAVIORAL_TOPIC = 3;

// This helper keeps derived scores and blend weights inside a known numeric range.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// This function scores positive behavioral evidence for an article.
function engagementScore(article) {
  const stars = article.starInd === 1 ? 1 : 0;
  const clicks = Math.min(Number(article.clickedAmount || 0), 3);
  const deepReads = Number(article.attentionBucket || 0) >= 3 ? 1 : 0;

  return (
    stars * SIGNAL_WEIGHTS.star +
    clicks * SIGNAL_WEIGHTS.click +
    deepReads * SIGNAL_WEIGHTS.deepRead
  );
}

// This function resolves the calendar day that contributes behavioral evidence.
function behaviorDay(article) {
  const value = article.published || article.updatedAt || article.createdAt;
  if (!value) return null;

  return new Date(value).toISOString().slice(0, 10);
}

// This function converts an article model into a behavioral clustering profile.
function buildArticleProfile(article) {
  const score = engagementScore(article);

  return {
    articleId: Number(article.id),
    feedId: Number(article.feedId),
    title: article.title,
    vector: Array.isArray(article.articleVector) ? article.articleVector : null,
    score,
    published: article.published,
    day: behaviorDay(article)
  };
}

// This function adds one article profile to an existing vector community.
function addArticleToCommunity(community, profile) {
  if (community.articles.some(article => article.articleId === profile.articleId)) return;

  community.articles.push(profile);
  community.samples.push({ vector: profile.vector, weight: profile.score });
  community.vector = weightedAverageVector(community.samples) || community.vector;
}

// This function clusters engaged article vectors into behavioral communities.
function buildBehavioralCommunities(articleProfiles, similarityThreshold) {
  const communities = [];
  const sorted = articleProfiles
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.articleId - b.articleId));

  for (const profile of sorted) {
    const ranked = communities
      .map(community => ({
        community,
        similarity: cosineSimilarity(profile.vector, community.vector)
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const best = ranked[0] || null;
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

  return communities
    .map(community => ({
      ...community,
      vector: weightedAverageVector(community.samples) || community.vector
    }))
    .sort((a, b) => (b.articles.length - a.articles.length) || (totalScore(b) - totalScore(a)));
}

// This function totals engagement evidence for a community.
function totalScore(community) {
  return community.articles.reduce((sum, article) => sum + article.score, 0);
}

// This function checks whether evidence spans multiple feeds or days.
function hasBehavioralBreadth(community) {
  const feedIds = new Set(community.articles.map(article => article.feedId).filter(Boolean));
  const days = new Set(community.articles.map(article => article.day).filter(Boolean));

  return feedIds.size >= 2 || days.size >= 2;
}

// This function chooses a stable topic label from the strongest article title.
function topicNameForCommunity(community) {
  const title = community.articles
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.articleId - b.articleId))
    .map(article => article.title)
    .find(Boolean);

  return (title || 'Behavioral Topic').slice(0, 255);
}

// This function finds the latest behavioral evidence timestamp in a community.
function lastBehaviorAt(community) {
  const timestamps = community.articles
    .map(article => article.published ? new Date(article.published).getTime() : null)
    .filter(value => Number.isFinite(value));

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

// This function builds the Topic payload for creating or updating a behavioral topic.
function topicPayload({ userId, community, existingTopic = null, vectorBlendAlpha }) {
  const incomingVector = normalizeVector(community.vector);
  const topicVector = existingTopic
    ? normalizeVector(blendTopicVectorWithAlpha(
      existingTopic.topicVector,
      incomingVector,
      clamp(vectorBlendAlpha, 0, 1)
    ))
    : incomingVector;

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

  for (const topic of existingTopics) {
    const similarity = cosineSimilarity(community.vector, topic.topicVector);
    if (!best || similarity > best.similarity) {
      best = { topic, similarity };
    }
  }

  return best?.similarity >= matchThreshold ? best : null;
}

// This function upserts article-topic evidence rows for a behavioral community.
async function upsertArticleTopicRows(topic, community, transaction) {
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

// This function builds behavioral topics for one user's engaged articles.
export async function buildBehavioralTopicsForUser(userId, options = {}) {
  const communitySimilarityThreshold =
    options.communitySimilarityThreshold ?? DEFAULT_COMMUNITY_SIMILARITY_THRESHOLD;
  const topicMatchThreshold = options.topicMatchThreshold ?? DEFAULT_TOPIC_MATCH_THRESHOLD;
  const engagementThreshold = options.engagementThreshold ?? DEFAULT_ENGAGEMENT_THRESHOLD;
  const vectorBlendAlpha = options.vectorBlendAlpha ?? DEFAULT_VECTOR_BLEND_ALPHA;

  const articles = await Article.findAll({
    where: {
      userId,
      articleVector: { [Op.ne]: null },
      [Op.or]: [
        { starInd: 1 },
        { clickedAmount: { [Op.gt]: 0 } },
        { attentionBucket: { [Op.gte]: 3 } }
      ]
    },
    attributes: [
      'id',
      'feedId',
      'title',
      'articleVector',
      'starInd',
      'clickedAmount',
      'attentionBucket',
      'published',
      'createdAt',
      'updatedAt'
    ],
    order: [
      ['starInd', 'DESC'],
      ['clickedAmount', 'DESC'],
      ['attentionBucket', 'DESC'],
      ['published', 'DESC'],
      ['id', 'ASC']
    ]
  });

  const profiles = articles
    .map(buildArticleProfile)
    .filter(profile => Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => profile.score > 0);

  const communities = buildBehavioralCommunities(profiles, communitySimilarityThreshold)
    .filter(community => community.articles.length >= MIN_ARTICLES_PER_BEHAVIORAL_TOPIC)
    .filter(community => totalScore(community) >= engagementThreshold)
    .filter(hasBehavioralBreadth);

  if (!communities.length) {
    return {
      topicCount: 0,
      articleTopicLinkCount: 0,
      communitiesConsidered: profiles.length ? buildBehavioralCommunities(profiles, communitySimilarityThreshold).length : 0
    };
  }

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
  const touchedTopicIds = [];

  await db.sequelize.transaction(async transaction => {
    for (const community of communities) {
      const best = findBestExistingTopic(community, existingTopics, topicMatchThreshold);
      const payload = topicPayload({
        userId,
        community,
        existingTopic: best?.topic,
        vectorBlendAlpha
      });

      const topic = best
        ? await best.topic.update(payload, { transaction })
        : await Topic.create(payload, { transaction });

      if (!best) existingTopics.push(topic);

      articleTopicLinkCount += await upsertArticleTopicRows(topic, community, transaction);
      touchedTopicIds.push(Number(topic.id));
      topicCount++;
    }
  });

  return {
    topicCount,
    articleTopicLinkCount,
    touchedTopicIds,
    communitiesConsidered: communities.length
  };
}

// This function runs behavioral topic generation from a simple options object.
export async function buildBehavioralTopics(options = {}) {
  const { userId } = options;
  if (!userId) throw new Error('buildBehavioralTopics requires a userId');

  return buildBehavioralTopicsForUser(userId, options);
}

export default buildBehavioralTopics;
