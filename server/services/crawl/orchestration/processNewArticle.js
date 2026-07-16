import applyActions from '../enrichment/applyActions.js';
import analyzeArticleContent from '../enrichment/analyzeArticleContent.js';
import {
  createEmptyOfficialSource,
  resolveOfficialSourceForArticle
} from '../enrichment/officialSource.js';
import saveArticle from '../persistence/saveArticle.js';
import { buildArticleIdentity, matchArticleDuplicate } from '../identity/articleDuplicateMatcher.js';
import updateArticle from '../persistence/updateArticle.js';
import processArticleRevision, {
  applyAnalysisScoreOverrides,
  countArticleHotlinks,
  createDefaultArticleAnalysis,
  persistAcceptedHotlinks,
  resolveArticleActions
} from './processArticleRevision.js';

const RATE_LIMIT_DELAY_MS = 3000;
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
  hotlinkBatcher
}) => {
  const { articleData, actionArticle, hotlinkUrls, identityInput } = candidate;
  const articleIdentity = buildArticleIdentity(identityInput);

  const duplicateMatch = await matchArticleDuplicate(articleIdentity, duplicateCache);
  if (duplicateMatch) return emptyArticleResult;

  // Retrieve actions before enrichment so discard matches can take the persistence-only path.
  const actions = await resolveArticleActions(feed, preloadedActions);
  const actionResult = applyActions(actions, actionArticle);

  let analysis = null;
  let hotlinkCount = 0;
  if (!actionResult.shouldDiscard) {
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

    // Hotness is derived only for articles accepted into the normal reading pipeline.
    hotlinkCount = await countArticleHotlinks(
      feed,
      articleData.normalizedUrl,
      hotlinkCountCache
    );
  }

  const officialSource = actionResult.shouldDiscard
    ? createEmptyOfficialSource()
    : await resolveOfficialSourceForArticle(feed.userId, articleData.link);
  const persistenceData = {
    ...articleData,
    ...officialSource,
    hotInd: hotlinkCount > 0,
    hotlinks: hotlinkCount
  };

  // Filtered articles remain eligible for publisher identity matching,
  // but must not suppress active articles through content hashes.
  const saveResult = await saveArticle(
    feed,
    persistenceData,
    analysis,
    actionResult
  );
  const savedArticle = saveResult.article;

  if (!saveResult.created) {
    // Classify the exact winning row so a URL race cannot target a different article.
    const concurrentUpdate = await updateArticle(feed, articleData, { article: savedArticle });
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
      precomputedAnalysis: analysis
    });
  }

  duplicateCache?.add(savedArticle);
  if (!actionResult.shouldDiscard) {
    // Hotlinks are persisted only after the article transaction commits.
    await persistAcceptedHotlinks(hotlinkUrls, feed, hotlinkBatcher);
  }

  return {
    newArticles: 1,
    updatedArticles: 0,
    errors: 0
  };
};

export default processNewArticle;
