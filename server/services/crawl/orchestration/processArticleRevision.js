import applyActions from '../enrichment/applyActions.js';
import analyzeArticleContent from '../enrichment/analyzeArticleContent.js';
import {
  applyAnalysisScoreOverrides,
  createDefaultArticleAnalysis
} from '../enrichment/articleAnalysis.js';
import { resolveArticleActions } from '../enrichment/articleActions.js';
import { applyArticleUpdate } from '../persistence/updateArticle.js';
import { resolveOfficialSourceForArticle } from '../enrichment/officialSource.js';
import {
  countArticleHotlinks,
  persistAcceptedHotlinks
} from '../runtime/hotlinkService.js';

const RATE_LIMIT_DELAY_MS = 3000;

// This function snapshots the identities that a committed article update may replace in the cache.
const buildDuplicateCacheArticleState = article => ({
  id: article.id,
  filteredInd: Boolean(article.filteredInd),
  urlHash: article.urlHash,
  normalizedUrlHash: article.normalizedUrlHash,
  title: article.title,
  published: article.published,
  contentTextHash: article.contentTextHash,
  contentSourceHash: article.contentSourceHash
});

// This function refreshes cache identities while supporting minimal cache test doubles.
const refreshDuplicateCache = (duplicateCache, previousArticleState, updatedArticle) => {
  if (typeof duplicateCache?.update === 'function') {
    duplicateCache.update(previousArticleState, updatedArticle);
    return;
  }

  duplicateCache?.add?.(updatedArticle);
};

// This function applies one classified publisher revision and its permitted derived updates.
const processArticleRevision = async ({
  feed,
  candidate,
  updatePlan,
  preloadedActions,
  hotlinkCountCache,
  hotlinkBatcher,
  duplicateCache,
  precomputedActionResult = null,
  precomputedAnalysis = null
}) => {
  const { articleData, actionArticle, hotlinkUrls } = candidate;

  // Publisher revisions preserve creation-time semantic state by design.
  // Vector, cluster, event, topic, island, and representative state are rebuilt only explicitly.
  const { changes } = updatePlan;
  const previousArticleState = buildDuplicateCacheArticleState(updatePlan.article);
  const requiresActions = changes.contentChanged ||
    changes.titleChanged ||
    changes.descriptionChanged ||
    changes.urlChanged;
  const requiresAnalysis = changes.contentChanged ||
    changes.titleChanged ||
    changes.descriptionChanged;
  const actions = requiresActions
    ? await resolveArticleActions(feed, preloadedActions)
    : null;
  const actionResult = requiresActions
    ? precomputedActionResult || applyActions(actions, actionArticle)
    : null;
  const derivedValues = requiresActions
    ? { filteredInd: Boolean(actionResult?.shouldDiscard) }
    : {};

  // Discard-matched revisions update the reading copy and hide the article without
  // changing article-level enrichment or semantic state.
  if (actionResult?.shouldDiscard) {
    const article = await applyArticleUpdate({
      updatePlan,
      derivedValues,
      tagUpdates: null,
      userId: feed.userId
    });
    refreshDuplicateCache(duplicateCache, previousArticleState, article);

    return {
      article,
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    };
  }

  let analysis = null;
  if (requiresAnalysis) {
    analysis = precomputedAnalysis || (
      feed?.applyAiAnalysis === false
        ? createDefaultArticleAnalysis()
        : await analyzeArticleContent({
            text: articleData.analysisText,
            title: articleData.title,
            categories: articleData.categories,
            feedName: feed?.feedName || '',
            rateLimitDelayMs: RATE_LIMIT_DELAY_MS
          })
    );
    analysis = applyAnalysisScoreOverrides(analysis, actionResult);
  }

  if (analysis) {
    Object.assign(derivedValues, {
      contentSummaryBullets: analysis.contentSummaryBullets,
      advertisementScore: analysis.advertisementScore,
      sentimentScore: analysis.sentimentScore,
      qualityScore: analysis.qualityScore
    });
  } else if (actionResult) {
    // Score provenance is not stored, so only explicit new overrides are safe to apply here.
    if (actionResult.advertisementScore !== null) {
      derivedValues.advertisementScore = actionResult.advertisementScore;
    }
    if (actionResult.qualityScore !== null) {
      derivedValues.qualityScore = actionResult.qualityScore;
    }
  }

  if (changes.urlChanged) {
    const officialSource = await resolveOfficialSourceForArticle(feed.userId, articleData.link);
    const hotlinkCount = await countArticleHotlinks(
      feed,
      updatePlan.updateValues.normalizedUrl,
      hotlinkCountCache
    );
    Object.assign(derivedValues, {
      isOfficialSource: officialSource.isOfficialSource,
      officialOrganization: officialSource.officialOrganization,
      hotInd: hotlinkCount > 0,
      hotlinks: hotlinkCount
    });
  }

  const tagUpdates = requiresActions || requiresAnalysis
    ? {
        generatedTags: analysis ? analysis.tags : undefined,
        feedTags: feed.feedTags,
        ruleTags: actionResult ? actionResult.tags : undefined
      }
    : null;

  // Engagement fields are intentionally absent because action/user provenance is not stored.
  const article = await applyArticleUpdate({
    updatePlan,
    derivedValues,
    tagUpdates,
    userId: feed.userId
  });
  refreshDuplicateCache(duplicateCache, previousArticleState, article);

  // Hotlinks are persisted only after the article transaction commits.
  await persistAcceptedHotlinks(hotlinkUrls, feed, hotlinkBatcher);

  return {
    article,
    newArticles: 0,
    updatedArticles: 1,
    errors: 0
  };
};

export default processArticleRevision;
