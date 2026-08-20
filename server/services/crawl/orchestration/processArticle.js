import updateArticle from '../persistence/updateArticle.js';
import buildArticleCandidate from './buildArticleCandidate.js';
import processNewArticle from './processNewArticle.js';
import processArticleRevision from './processArticleRevision.js';
import {
  isFeedTimeoutError,
  throwIfExecutionExpired
} from '../../feeds/executionDeadline.js';

// Builds the empty article result assembled for this service.
const emptyArticleResult = {
  newArticles: 0,
  updatedArticles: 0,
  errors: 0
};

// This function coordinates publisher identity resolution with new and revision workflows.
const processArticle = async (
  feed,
  entry,
  preloadedActions = null,
  duplicateCache = null,
  hotlinkCountCache = null,
  hotlinkBatcher = null,
  feedPublishedFallback = null,
  rssFeedTitle = null,
  feedFormat = null,
  execution = {}
) => {
  try {
    const hasExecution = Boolean(execution.signal || execution.deadlineAt);
    throwIfExecutionExpired(execution);
    // Builds the article candidate while processing article.
    const candidate = await buildArticleCandidate({
      feed,
      entry,
      feedPublishedFallback,
      rssFeedTitle,
      feedFormat
    });
    throwIfExecutionExpired(execution);
    // Returns early when candidate is unavailable.
    if (!candidate) return emptyArticleResult;

    // Publisher identity matching happens before duplicate suppression because
    // identity determines revisions while duplicate matching detects equivalent content.
    const updatePlan = hasExecution
      ? await updateArticle(feed, candidate.articleData, { execution })
      : await updateArticle(feed, candidate.articleData);
    throwIfExecutionExpired(execution);
    // Handles the case where update plan matched is available.
    if (updatePlan.matched) {
      // Returns early when update plan changed is unavailable.
      if (!updatePlan.changed) return emptyArticleResult;

      return await processArticleRevision({
        feed,
        candidate,
        updatePlan,
        preloadedActions,
        duplicateCache,
        hotlinkCountCache,
        hotlinkBatcher,
        ...(hasExecution ? { execution } : {})
      });
    }

    return await processNewArticle({
      feed,
      candidate,
      preloadedActions,
      duplicateCache,
      hotlinkCountCache,
      hotlinkBatcher,
      ...(hasExecution ? { execution } : {})
    });
  } catch (err) {
    if (isFeedTimeoutError(err) || err?.code === 'FEED_LEASE_LOST') throw err;
    if (['INFERENCE_TIMEOUT', 'INFERENCE_UNAVAILABLE'].includes(err?.code)) {
      console.error(`[CRAWL] ${err.message}`);
    } else {
      console.error('Error processing article:', err);
    }
    return {
      newArticles: 0,
      updatedArticles: 0,
      errors: 1
    };
  }
};

export default processArticle;
