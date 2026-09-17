import applyActions from '../enrichment/applyActions.js';
import { resolveArticleActions } from '../enrichment/articleActions.js';
import { applyArticleUpdate } from '../persistence/updateArticle.js';
import { resolveOfficialSourceForArticle } from '../enrichment/officialSource.js';
import {
  countArticleHotlinks,
  persistAcceptedHotlinks
} from '../runtime/hotlinkService.js';
import { throwIfExecutionExpired } from '../../feeds/executionDeadline.js';

// This function snapshots the identities that a committed article update may replace in the cache.
const buildDuplicateCacheArticleState = article => ({
  id: article.id,
  filteredInd: Boolean(article.filteredInd),
  urlHash: article.urlHash,
  normalizedUrlHash: article.normalizedUrlHash,
  title: article.title,
  publishedAt: article.publishedAt,
  contentTextHash: article.contentTextHash,
  contentSourceHash: article.contentSourceHash
});

// This function refreshes cache identities while supporting minimal cache test doubles.
const refreshDuplicateCache = (duplicateCache, previousArticleState, updatedArticle) => {
  // Handles the case where duplicate cache is function.
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
  execution = {}
}) => {
  const hasExecution = Boolean(execution.signal || execution.deadlineAt);
  throwIfExecutionExpired(execution);
  const { articleData, actionArticle, hotlinkUrls } = candidate;

  // Publisher revisions preserve creation-time semantic state by design.
  // Vector, cluster, event, island, and representative state are rebuilt only explicitly.
  const { changes } = updatePlan;
  // Builds the duplicate cache article state while processing article revision.
  const previousArticleState = buildDuplicateCacheArticleState(updatePlan.article);
  // Derives the requires actions required while processing article revision.
  const requiresActions = changes.contentChanged ||
    changes.titleChanged ||
    changes.descriptionChanged ||
    changes.urlChanged;
  // Selects the actions based on whether requires actions is available.
  const actions = requiresActions
    ? await resolveArticleActions(feed, preloadedActions)
    : null;
  throwIfExecutionExpired(execution);
  // Selects the action result based on whether requires actions is available.
  const actionResult = requiresActions
    ? precomputedActionResult || applyActions(actions, actionArticle)
    : null;
  // Selects the derived values based on whether requires actions is available.
  const derivedValues = requiresActions
    ? { filteredInd: Boolean(actionResult?.shouldDiscard) }
    : {};

  // Discard-matched revisions update the reading copy and hide the article without
  // changing article-level enrichment or semantic state.
  if (actionResult?.shouldDiscard) {
    // Derives the article through apply article update while processing article revision.
    const article = await applyArticleUpdate({
      updatePlan,
      derivedValues,
      tagUpdates: null,
      userId: feed.userId,
      ...(hasExecution ? { execution } : {})
    });
    refreshDuplicateCache(duplicateCache, previousArticleState, article);

    // Replacing the observation set with an empty set removes links retained
    // from the previously accepted revision.
    const hotlinkArguments = [[], feed, article.id, hotlinkBatcher];
    if (hasExecution) hotlinkArguments.push(execution);
    await persistAcceptedHotlinks(...hotlinkArguments);

    return {
      article,
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    };
  }

  // Handles the case where changes url changed is available.
  if (changes.urlChanged) {
    // Resolves the official source for article while processing article revision.
    const officialSource = await resolveOfficialSourceForArticle(feed.userId, articleData.link);
    throwIfExecutionExpired(execution);
    // Derives the hotlink count through count article hotlinks while processing article revision.
    const hotlinkCount = await countArticleHotlinks(
      feed,
      updatePlan.updateValues.normalizedUrl,
      hotlinkCountCache
    );
    throwIfExecutionExpired(execution);
    Object.assign(derivedValues, {
      isOfficialSource: officialSource.isOfficialSource,
      officialOrganization: officialSource.officialOrganization,
      hotInd: hotlinkCount > 0,
      hotlinks: hotlinkCount
    });
  }

  // Preserve inferred tags from the retained analysis while updating publisher and rule tags.
  const tagUpdates = requiresActions
    ? {
        providerTags: articleData.categories,
        feedTags: feed.feedTags,
        ruleTags: actionResult ? actionResult.tags : undefined
      }
    : null;

  // Engagement fields are intentionally absent because action/user provenance is not stored.
  const article = await applyArticleUpdate({
    updatePlan,
    derivedValues,
    tagUpdates,
    userId: feed.userId,
    ...(hasExecution ? { execution } : {})
  });
  refreshDuplicateCache(duplicateCache, previousArticleState, article);

  // Hotlinks are persisted only after the article transaction commits.
  const hotlinkArguments = [
    hotlinkUrls,
    feed,
    article.id,
    hotlinkBatcher,
  ];
  if (hasExecution) hotlinkArguments.push(execution);
  await persistAcceptedHotlinks(...hotlinkArguments);

  return {
    article,
    newArticles: 0,
    updatedArticles: 1,
    errors: 0
  };
};

export default processArticleRevision;
