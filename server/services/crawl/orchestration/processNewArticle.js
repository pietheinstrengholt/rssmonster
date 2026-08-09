import applyActions from '../enrichment/applyActions.js';
import analyzeArticleContent from '../enrichment/analyzeArticleContent.js';
import {
  applyAnalysisScoreOverrides,
  createDefaultArticleAnalysis
} from '../enrichment/articleAnalysis.js';
import { resolveArticleActions } from '../enrichment/articleActions.js';
import {
  createEmptyOfficialSource,
  resolveOfficialSourceForArticle
} from '../enrichment/officialSource.js';
import saveArticle from '../persistence/saveArticle.js';
import { buildArticleIdentity, matchArticleDuplicate } from '../identity/articleDuplicateMatcher.js';
import updateArticle from '../persistence/updateArticle.js';
import {
  countArticleHotlinks,
  persistAcceptedHotlinks
} from '../runtime/hotlinkService.js';
import processArticleRevision from './processArticleRevision.js';
import { throwIfExecutionExpired } from '../../feeds/executionDeadline.js';

// Defines the rate limit delay ms enforced by this service.
const RATE_LIMIT_DELAY_MS = 3000;
// Builds the empty article result assembled for this service.
const emptyArticleResult = {
  newArticles: 0,
  updatedArticles: 0,
  errors: 0
};

// This function owns duplicate prevention, actions, enrichment, and article creation.
const processNewArticle = async ({
  feed,
  candidate,
  preloadedActions,
  duplicateCache,
  hotlinkCountCache,
  hotlinkBatcher,
  execution = {}
}) => {
  const hasExecution = Boolean(execution.signal || execution.deadlineAt);
  throwIfExecutionExpired(execution);
  const { articleData, actionArticle, hotlinkUrls, identityInput } = candidate;
  // Builds the article identity while processing new article.
  const articleIdentity = buildArticleIdentity(identityInput);

  // Derives the duplicate match through match article duplicate while processing new article.
  const duplicateMatch = await matchArticleDuplicate(articleIdentity, duplicateCache);
  throwIfExecutionExpired(execution);
  // Returns early when duplicate match is available.
  if (duplicateMatch) return emptyArticleResult;

  // Retrieve actions before enrichment so discard matches can take the persistence-only path.
  const actions = await resolveArticleActions(feed, preloadedActions);
  throwIfExecutionExpired(execution);
  // Derives the action result through apply actions while processing new article.
  const actionResult = applyActions(actions, actionArticle);

  let analysis = null;
  let hotlinkCount = 0;
  // Handles the case where action result should discard is unavailable.
  if (!actionResult.shouldDiscard) {
    // Selects the result based on whether apply ai analysis is value.
    analysis = feed?.applyAiAnalysis === false
      ? createDefaultArticleAnalysis()
      : await analyzeArticleContent({
        text: articleData.analysisText,
        title: articleData.title,
        categories: articleData.categories,
        feedName: feed?.feedName || '',
        rateLimitDelayMs: RATE_LIMIT_DELAY_MS
      });
    analysis = applyAnalysisScoreOverrides(analysis, actionResult);
    throwIfExecutionExpired(execution);

    // Hotness is derived only for articles accepted into the normal reading pipeline.
    hotlinkCount = await countArticleHotlinks(
      feed,
      articleData.normalizedUrl,
      hotlinkCountCache
    );
    throwIfExecutionExpired(execution);
  }

  // Selects the official source based on whether action result should discard is available.
  const officialSource = actionResult.shouldDiscard
    ? createEmptyOfficialSource()
    : await resolveOfficialSourceForArticle(feed.userId, articleData.link);
  throwIfExecutionExpired(execution);
  // Builds the persistence data assembled while processing new article.
  const persistenceData = {
    ...articleData,
    ...officialSource,
    hotInd: hotlinkCount > 0,
    hotlinks: hotlinkCount
  };

  // Filtered articles remain eligible for publisher identity matching,
  // but must not suppress active articles through content hashes.
  const saveArguments = [
    feed,
    persistenceData,
    analysis,
    actionResult
  ];
  if (hasExecution) saveArguments.push(execution);
  const saveResult = await saveArticle(...saveArguments);
  const savedArticle = saveResult.article;

  // Handles the case where save result created is unavailable.
  if (!saveResult.created) {
    // Classify the exact winning row so a URL race cannot target a different article.
    const concurrentUpdate = await updateArticle(feed, articleData, {
      article: savedArticle,
      ...(hasExecution ? { execution } : {})
    });
    throwIfExecutionExpired(execution);
    // Handles the case where concurrent update changed is unavailable.
    if (!concurrentUpdate.changed) {
      duplicateCache?.add(savedArticle);
      return emptyArticleResult;
    }

    return processArticleRevision({
      feed,
      candidate,
      updatePlan: concurrentUpdate,
      preloadedActions,
      hotlinkCountCache,
      hotlinkBatcher,
      duplicateCache,
      precomputedActionResult: actionResult,
      precomputedAnalysis: analysis,
      ...(hasExecution ? { execution } : {})
    });
  }

  duplicateCache?.add(savedArticle);
  // Handles the case where action result should discard is unavailable.
  if (!actionResult.shouldDiscard) {
    // Hotlinks are persisted only after the article transaction commits.
    const hotlinkArguments = [
      hotlinkUrls,
      feed,
      savedArticle.id,
      hotlinkBatcher,
    ];
    if (hasExecution) hotlinkArguments.push(execution);
    await persistAcceptedHotlinks(...hotlinkArguments);
  }

  // Selects the result based on whether action result should discard is available.
  return {
    newArticles: actionResult.shouldDiscard ? 0 : 1,
    filteredArticles: actionResult.shouldDiscard ? 1 : 0,
    updatedArticles: 0,
    errors: 0
  };
};

export default processNewArticle;
