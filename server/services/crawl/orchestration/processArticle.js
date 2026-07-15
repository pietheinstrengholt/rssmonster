import updateArticle from '../persistence/updateArticle.js';
import buildArticleCandidate from './buildArticleCandidate.js';
import processNewArticle from './processNewArticle.js';
import processArticleRevision from './processArticleRevision.js';

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
  feedFormat = null
) => {
  try {
    const candidate = await buildArticleCandidate({
      feed,
      entry,
      feedPublishedFallback,
      rssFeedTitle,
      feedFormat
    });
    if (!candidate) return emptyArticleResult;

    // Publisher identity matching happens before duplicate suppression because
    // identity determines revisions while duplicate matching detects equivalent content.
    const updatePlan = await updateArticle(feed, candidate.articleData);
    if (updatePlan.matched) {
      if (!updatePlan.changed) return emptyArticleResult;

      return await processArticleRevision({
        feed,
        candidate,
        updatePlan,
        preloadedActions,
        duplicateCache,
        hotlinkCountCache,
        hotlinkBatcher
      });
    }

    return await processNewArticle({
      feed,
      candidate,
      preloadedActions,
      duplicateCache,
      hotlinkCountCache,
      hotlinkBatcher
    });
  } catch (err) {
    console.error('Error processing article:', err);
    return {
      newArticles: 0,
      updatedArticles: 0,
      errors: 1
    };
  }
};

export default processArticle;
