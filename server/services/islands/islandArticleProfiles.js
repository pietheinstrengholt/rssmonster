import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  DEFAULT_ARTICLE_AFFINITY_THRESHOLD,
  DEFAULT_ARTICLE_SIGNAL_THRESHOLD,
  DEFAULT_MAX_ISLANDS_PER_USER,
  ISLAND_DEBUG,
  SIGNAL_WEIGHTS,
  addPositiveSignals,
  articleMagnitude,
  buildPositiveSignalsAccumulator,
  clamp,
  cosineSimilarity,
  debugIsland,
  normalizeVector,
  topicRecencyWeight,
  weightedAverageVector
} from './islandVectorUtils.js';

const { Article } = db;

// This function converts article behavior fields into weighted positive and negative signals.
export function computeArticleSignals(article) {
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
