import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { cosineSimilarity, hasUsableVector, parseVector } from '../vectors/index.js';

// Provides the shared dependencies used by this recommendation service.
const { Article, Feed } = db;
// Defines the largest recent candidate pool allowed by the baseline implementation.
const HARD_MAX_CANDIDATES = 600;
// Defines the largest recommendation result exposed by the endpoint.
const MAX_RECOMMENDATIONS = 4;

// This function resolves a bounded numeric similarity threshold from configuration.
function resolveSimilarityThreshold(value = process.env.ARTICLE_RECOMMENDATION_MIN_SIMILARITY) {
  const parsed = Number.parseFloat(value ?? '0.64');
  return Number.isFinite(parsed) && parsed >= -1 && parsed <= 1 ? parsed : 0.64;
}

// This function resolves the configured candidate count without exceeding the v1 safety cap.
function resolveMaxCandidates(value = process.env.ARTICLE_RECOMMENDATION_MAX_CANDIDATES) {
  const parsed = Number.parseInt(value ?? String(HARD_MAX_CANDIDATES), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return HARD_MAX_CANDIDATES;
  return Math.min(parsed, HARD_MAX_CANDIDATES);
}

// This function parses stored vector representations and rejects empty vectors.
function resolveUsableVector(vector) {
  const parsed = parseVector(vector);
  if (!hasUsableVector(parsed)) return null;
  return parsed.every(value => Number.isFinite(Number(value))) ? parsed : null;
}

// This function loads the owned canonical source article required for recommendations.
async function loadRecommendationSource(userId, articleId) {
  return Article.findOne({
    where: {
      id: articleId,
      userId,
      ...canonicalArticleWhere()
    },
    attributes: [
      'id',
      'eventId',
      'articleVector',
      'embedding_model',
      'publishedAt'
    ]
  });
}

// This function builds the user-scoped eligibility predicate for recent candidates.
function buildCandidateWhere(userId, source) {
  return {
    userId,
    id: { [Op.ne]: source.id },
    ...canonicalArticleWhere(),
    articleVector: { [Op.ne]: null },
    ...(source.embedding_model
      ? { embedding_model: source.embedding_model }
      : {}),
    ...(source.eventId == null
      ? {}
      : {
          [Op.or]: [
            { eventId: { [Op.ne]: source.eventId } },
            { eventId: { [Op.is]: null } }
          ]
        })
  };
}

// This function loads the recent vectorized candidates and response metadata in one query.
async function loadRecentCandidates(userId, source, maxCandidates) {
  return Article.findAll({
    where: buildCandidateWhere(userId, source),
    attributes: [
      'id',
      'feedId',
      'title',
      'description',
      'url',
      'imageUrl',
      'publishedAt',
      'eventId',
      'status',
      'articleVector'
    ],
    include: [{
      model: Feed,
      required: true,
      attributes: ['id', 'feedName', 'favicon']
    }],
    order: [
      ['publishedAt', 'DESC'],
      ['id', 'DESC']
    ],
    limit: maxCandidates
  });
}

// This function scores valid candidates and records threshold diagnostics for tests and tuning.
function scoreCandidates(sourceVector, candidates, threshold) {
  const scored = [];
  let invalidVectorCount = 0;
  let rejectedByThresholdCount = 0;

  for (const candidate of candidates) {
    const candidateVector = resolveUsableVector(candidate.articleVector);
    if (!candidateVector || candidateVector.length !== sourceVector.length) {
      invalidVectorCount += 1;
      continue;
    }

    const similarity = cosineSimilarity(sourceVector, candidateVector, {
      coerceNumbers: true
    });
    if (!Number.isFinite(similarity)) {
      invalidVectorCount += 1;
      continue;
    }

    const scoredCandidate = { article: candidate, similarity };
    scored.push(scoredCandidate);
    if (similarity < threshold) rejectedByThresholdCount += 1;
  }

  scored.sort((left, right) => (
    right.similarity - left.similarity ||
    new Date(right.article.publishedAt).getTime() - new Date(left.article.publishedAt).getTime() ||
    Number(right.article.id) - Number(left.article.id)
  ));

  return {
    eligible: scored.filter(candidate => candidate.similarity >= threshold),
    diagnostics: {
      scoredCandidateCount: scored.length,
      invalidVectorCount,
      rejectedByThresholdCount,
      topSimilarities: scored.slice(0, 10).map(candidate => ({
        articleId: candidate.article.id,
        similarity: Number(candidate.similarity.toFixed(4)),
        accepted: candidate.similarity >= threshold
      }))
    }
  };
}

// This function keeps only the strongest candidate from each non-standalone event.
function diversifyByEvent(scoredCandidates) {
  const selected = [];
  const selectedEventIds = new Set();

  for (const candidate of scoredCandidates) {
    const eventId = candidate.article.eventId;
    if (eventId != null && selectedEventIds.has(String(eventId))) continue;

    selected.push(candidate);
    if (eventId != null) selectedEventIds.add(String(eventId));
    if (selected.length >= MAX_RECOMMENDATIONS) break;
  }

  return selected;
}

// This function maps an internal scored candidate to the public recommendation projection.
function serializeRecommendation(candidate) {
  const article = candidate.article;
  const feed = article.get?.('Feed') ?? article.get?.('feed') ?? article.Feed ?? article.feed;
  return {
    id: article.id,
    feedId: article.feedId,
    title: article.title,
    description: article.description,
    url: article.url,
    imageUrl: article.imageUrl,
    publishedAt: article.publishedAt,
    eventId: article.eventId,
    status: article.status,
    recommendationSimilarity: Number(candidate.similarity.toFixed(4)),
    Feed: feed
      ? {
          id: feed.id,
          feedName: feed.feedName,
          favicon: feed.favicon
        }
      : null
  };
}

// This function returns recent semantic recommendations and optional diagnostics for one owned article.
export async function getArticleRecommendations({
  userId,
  articleId,
  minSimilarity,
  maxCandidates
}) {
  const threshold = resolveSimilarityThreshold(minSimilarity);
  const candidateLimit = resolveMaxCandidates(maxCandidates);
  const source = await loadRecommendationSource(userId, articleId);

  if (!source) return null;

  const sourceVector = resolveUsableVector(source.articleVector);
  if (!sourceVector) {
    return {
      sourceArticleId: source.id,
      articles: [],
      diagnostics: {
        candidateCount: 0,
        scoredCandidateCount: 0,
        invalidVectorCount: 0,
        rejectedByThresholdCount: 0,
        topSimilarities: [],
        finalRecommendations: []
      }
    };
  }

  const candidates = await loadRecentCandidates(userId, source, candidateLimit);
  const scoring = scoreCandidates(sourceVector, candidates, threshold);
  const selected = diversifyByEvent(scoring.eligible);
  const articles = selected.map(serializeRecommendation);

  return {
    sourceArticleId: source.id,
    articles,
    diagnostics: {
      candidateCount: candidates.length,
      ...scoring.diagnostics,
      finalRecommendations: articles.map(article => ({
        articleId: article.id,
        similarity: article.recommendationSimilarity
      }))
    }
  };
}

export default getArticleRecommendations;
