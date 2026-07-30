import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
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

// Provides the shared dependencies used by this service.
const { Article } = db;

// This function converts article behavior fields into weighted positive and negative signals.
export function computeArticleSignals(article) {
  // Selects the positives based on whether article positive status is 1.
  const positives = article.positiveInd === 1 ? 1 : 0;
  // Selects the stars based on whether article favorite status is 1.
  const stars = article.favoriteInd === 1 ? 1 : 0;
  // Derives the clicks through min while computing article signals.
  const clicks = Math.min(article.clickedAmount || 0, 3);
  // Selects the deep reads based on whether article reaches 3.
  const deepReads = (article.attentionBucket || 0) >= 3 ? 1 : 0;
  // Selects the negative based on whether article negative status is 1.
  const negative = article.negativeInd === 1 ? 1 : 0;
  // Derives the recency through topic recency weight while computing article signals.
  const recency = topicRecencyWeight(article.publishedAt);

  // Derives the positive score required while computing article signals.
  const positiveScore = (
    positives * SIGNAL_WEIGHTS.positive +
    stars * SIGNAL_WEIGHTS.star +
    clicks * SIGNAL_WEIGHTS.click +
    deepReads * SIGNAL_WEIGHTS.deepRead
  ) * recency;

  // Derives the negative score required while computing article signals.
  const negativeScore = negative * SIGNAL_WEIGHTS.negative;

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
    score,
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
function buildArticleIslandWeight(articleProfiles) {
  // Returns early when article profiles is empty.
  if (!articleProfiles.length) return 0;

  // Derives the average score required while building article island weight.
  const averageScore = articleProfiles.reduce((sum, article) => sum + article.score, 0) / articleProfiles.length;
  // Derives the denominator through max while building article island weight.
  const denominator = Math.max(1, SIGNAL_WEIGHTS.star + SIGNAL_WEIGHTS.deepRead + SIGNAL_WEIGHTS.click);
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

// This function clusters engaged article profiles into candidate interest islands.
function buildBehavioralArticleCommunities(articleProfiles, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER) {
  // Derives the sorted through sort while building behavioral article communities.
  const sorted = articleProfiles
    .slice()
    .sort((a, b) => (Math.abs(b.score) - Math.abs(a.score)) || (a.articleId - b.articleId));

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
        affinity: cosineSimilarity(article.vector, community.vector)
      }))
      .sort((a, b) => b.affinity - a.affinity);

    // Derives the best required while building behavioral article communities.
    const best = rankedCommunities[0] || null;

    // Handles the case where best is available and best affinity reaches default article affinity threshold.
    if (best && best.affinity >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD) {
      addArticleToCommunity(best.community, article);
      continue;
    }

    // Handles the case where communities count reaches max islands and best is available.
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

  // Maps source values into the result produced while building behavioral article communities.
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
  // Derives the max islands required while building interest island profiles for user.
  const maxIslands = options.maxIslands || DEFAULT_MAX_ISLANDS_PER_USER;

  // Loads the articles needed while building interest island profiles for user.
  const articles = await Article.findAll({
    where: {
      userId,
      ...canonicalArticleWhere(),
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
      'title',
      'articleVector',
      'positiveInd',
      'favoriteInd',
      'clickedAmount',
      'attentionBucket',
      'negativeInd',
      'publishedAt'
    ],
    order: [
      ['positiveInd', 'DESC'],
      ['favoriteInd', 'DESC'],
      ['clickedAmount', 'DESC'],
      ['attentionBucket', 'DESC'],
      ['publishedAt', 'DESC'],
      ['id', 'ASC']
    ]
  });

  // Keeps the article profiles entries eligible while building interest island profiles for user.
  const articleProfiles = articles
    .map(computeBehavioralArticleProfile)
    .filter(profile => Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => Math.abs(profile.score) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD);

  // Builds the behavioral article communities while building interest island profiles for user.
  const communities = buildBehavioralArticleCommunities(articleProfiles, maxIslands);

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
