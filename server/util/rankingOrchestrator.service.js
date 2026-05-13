/**
 * Ranking Orchestrator Service
 *
 * Responsibilities:
 * - Score articles against profiles
 * - Constrain island attachment density
 * - Orchestrate main ranking pipeline for RECOMMENDED sort
 */

import { computeRecommended } from './recommendedScore.js';
import { scoreProfileMatch } from './profileSelector.service.js';
import { scoreSuppressionPenalty } from './suppressionScorer.service.js';
import { clamp } from './vectorMath.js';
import {
  RANKING_AFFINITY_THRESHOLD,
  MIN_ISLAND_ATTACH_RATIO,
  TARGET_ISLAND_ATTACH_RATIO,
  MAX_ISLAND_ATTACH_RATIO
} from '../config/ranking.config.js';

export function articleInterestVector(article) {
  // Extract semantic vector from article or cluster
  const cluster = article?.get?.('cluster') ?? article?.cluster;
  const vector = cluster?.topicVector ?? cluster?.eventVector ?? article?.topicVector ?? article?.eventVector;
  
  if (!Array.isArray(vector)) {
    return null;
  }
  
  return vector.map(value => Number(value) || 0);
}

export function scoreArticleAgainstProfiles(article, profiles) {
  const cluster = article.get?.('cluster') ?? article.cluster;
  const vector = articleInterestVector(article);
  const topicKey = cluster?.topicKey ?? null;
  const match = scoreProfileMatch(vector, topicKey, profiles);

  if (!match.profileId || Number(match.affinityScore) < RANKING_AFFINITY_THRESHOLD) {
    return {
      affinityScore: 0,
      profileId: null,
      profileLabel: null,
      profileInteractionCount: 0,
      profileStarCount: 0,
      profileClickCount: 0
    };
  }

  const matchedProfile = profiles.find(profile => profile.id === match.profileId);
  return {
    affinityScore: match.affinityScore,
    profileId: match.profileId,
    profileLabel: match.profileLabel,
    profileInteractionCount: matchedProfile?.interactionCount || 0,
    profileStarCount: matchedProfile?.starCount || 0,
    profileClickCount: matchedProfile?.clickCount || 0
  };
}

export function constrainIslandAttachmentDensity(scoredArticles) {
  if (!Array.isArray(scoredArticles) || scoredArticles.length === 0) {
    return scoredArticles;
  }

  const matched = scoredArticles
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => item.profileId && Number(item.affinityScore) >= RANKING_AFFINITY_THRESHOLD)
    .sort((left, right) => Number(right.item.affinityScore) - Number(left.item.affinityScore));

  const totalCount = scoredArticles.length;
  const minAttach = Math.floor(totalCount * MIN_ISLAND_ATTACH_RATIO);
  const targetAttach = Math.round(totalCount * TARGET_ISLAND_ATTACH_RATIO);
  const maxAttach = Math.ceil(totalCount * MAX_ISLAND_ATTACH_RATIO);

  let keepCount = Math.min(targetAttach, maxAttach);
  if (matched.length < keepCount) {
    keepCount = matched.length;
  } else if (keepCount < minAttach && matched.length >= minAttach) {
    keepCount = minAttach;
  }

  const keepIndexes = new Set(matched.slice(0, keepCount).map(({ index }) => index));

  return scoredArticles.map((item, index) => {
    if (keepIndexes.has(index)) {
      return item;
    }

    const demotedScore = clamp(
      (0.3 * item.recommendedBase) * item.freshnessFactor * (1 - (Number(item.suppressionPenalty) || 0)),
      0,
      1
    );

    return {
      ...item,
      profileId: null,
      profileLabel: null,
      profileInteractionCount: 0,
      profileStarCount: 0,
      profileClickCount: 0,
      normalizedAffinity: 0,
      affinityScore: 0,
      score: demotedScore
    };
  });
}

/**
 * Main read path for RECOMMENDED sort.
 *
 * Flow:
 * - Score each candidate article against profiles and recommended baseline.
 * - Apply suppression penalties.
 * - Constrain island attachment density.
 * - Sort by final score.
 */
export async function rankRecommendedArticles({ userId, articles = [], profiles = [], suppressionSignals = {} } = {}) {
  if (!userId || !Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  const scoredArticles = articles.map(article => {
    const cluster = article.get?.('cluster') ?? article.cluster;
    const scoreParts = scoreArticleAgainstProfiles(article, profiles);

    const affinityScore = scoreParts.affinityScore;
    const recommendedBase = clamp(Number(computeRecommended(article) ?? 0), 0, 1);
    const rawFreshness = Number(article?.freshness ?? 0.5);
    const freshness = Number.isFinite(rawFreshness) ? clamp(rawFreshness, 0, 1) : 0.5;
    const flooredFreshness = Math.max(0.05, freshness);
    const normalizedAffinity = Math.pow(clamp(affinityScore, 0, 1), 1.4);
    const freshnessFactor = 0.25 + flooredFreshness * 0.75;
    const suppressionDebug = scoreSuppressionPenalty(article, suppressionSignals);
    const suppressionPenalty = suppressionDebug.penalty;
    const scoreBeforeSuppression = clamp(
      (normalizedAffinity * 0.7 + recommendedBase * 0.3) * freshnessFactor,
      0,
      1
    );
    const score = clamp(scoreBeforeSuppression * (1 - suppressionPenalty), 0, 1);

    return {
      article,
      profileId: scoreParts.profileId,
      profileLabel: scoreParts.profileLabel,
      profileInteractionCount: scoreParts.profileInteractionCount,
      profileStarCount: scoreParts.profileStarCount,
      profileClickCount: scoreParts.profileClickCount,
      clusterId: cluster?.id ?? article.clusterId ?? null,
      topicKey: cluster?.topicKey ?? null,
      normalizedAffinity,
      freshnessFactor,
      suppressionPenalty,
      suppressionSource: suppressionDebug.source,
      suppressionReason: suppressionDebug.reason,
      suppressionComponents: suppressionDebug.components,
      affinityScore,
      recommendedBase,
      score
    };
  });

  const constrained = constrainIslandAttachmentDensity(scoredArticles);
  constrained.sort((left, right) => right.score - left.score);

  return constrained;
}
