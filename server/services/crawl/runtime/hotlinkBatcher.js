import hotlink from '../../../controllers/hotlink.js';
import { throwIfExecutionExpired } from '../../feeds/executionDeadline.js';
import { recordProcessingFailure } from '../../observability/processingFailures.js';

// Defines the default flush threshold enforced by this service.
const DEFAULT_FLUSH_THRESHOLD = 250;
// Defines the default max pending urls enforced by this service.
const DEFAULT_MAX_PENDING_URLS = 1000;

// This function creates a bounded, best-effort hotlink writer for one feed.
const createHotlinkBatcher = (feed, options = {}) => {
  // Resolves the flush threshold that governs creating hotlink batcher.
  const flushThreshold = options.flushThreshold || DEFAULT_FLUSH_THRESHOLD;
  // Derives the max pending url required while creating hotlink batcher.
  const maxPendingUrls = options.maxPendingUrls || DEFAULT_MAX_PENDING_URLS;
  const execution = options.execution || {};
  const hasExecution = Boolean(execution.signal || execution.deadlineAt);
  // Derives the pending url by article id required while creating hotlink batcher.
  const pendingUrlsByArticleId = new Map();
  let pendingUrlCount = 0;
  let flushPromise = null;
  let overflowLogged = false;

  // This function flushes the queued URLs without allowing failures to interrupt crawling.
  const flush = async () => {
    throwIfExecutionExpired(execution);
    // Repeats this processing step while eligible work remains.
    while (flushPromise || pendingUrlsByArticleId.size > 0) {
      // Handles the case where flush promise is available.
      if (flushPromise) {
        await flushPromise;
        continue;
      }

      // Collects the pending writes while performing flush.
      const pendingWrites = [...pendingUrlsByArticleId.entries()];
      pendingUrlsByArticleId.clear();
      pendingUrlCount = 0;
      // Maps source values into the result produced while performing flush.
      const replacementArguments = [
        pendingWrites.map(([sourceArticleId, urls]) => ({
          sourceArticleId,
          urls: [...urls]
        })),
        feed.id,
        feed.userId
      ];
      if (hasExecution) replacementArguments.push(execution);
      flushPromise = hotlink.replaceMany(...replacementArguments)
        .catch(async err => {
          await recordProcessingFailure({
            crawlRunId: execution.crawlRunId,
            executionId: execution.executionId,
            userId: feed?.userId,
            stage: 'article_persistence',
            failureType: 'PERSISTENCE_FAILURE',
            severity: 'WARNING',
            error: err,
            subjectType: 'feed',
            subjectId: feed?.id,
            feedId: feed?.id,
            context: { target: 'hotlink_batch' }
          });
          console.error(`Error saving hotlink batch for feed ${feed.id}:`, err);
        })
        .finally(() => {
          flushPromise = null;
        });

      await flushPromise;
      throwIfExecutionExpired(execution);
    }
  };

  return {
    // This function queues one article's unique URLs and starts a best-effort periodic flush.
    add(urls, sourceArticleId) {
      throwIfExecutionExpired(execution);
      // Returns early when source article id is unavailable.
      if (!sourceArticleId) return;

      // Derives the previous url through get while creating hotlink batcher.
      const previousUrls = pendingUrlsByArticleId.get(sourceArticleId);
      // Handles the case where previous url is available.
      if (previousUrls) {
        pendingUrlCount -= previousUrls.size;
      }

      // Tracks distinct article url while creating hotlink batcher.
      const articleUrls = new Set();
      // Processes each urls entry in turn.
      for (const url of urls) {
        // Skips the current entry when article url contains url.
        if (articleUrls.has(url)) continue;

        // Handles the case where pending url count reaches max pending url.
        if (pendingUrlCount + articleUrls.size >= maxPendingUrls) {
          // Handles the case where overflow logged is unavailable.
          if (!overflowLogged) {
            console.warn(`Hotlink batch queue reached ${maxPendingUrls} URLs for feed ${feed.id}; dropping excess URLs.`);
            overflowLogged = true;
          }
          break;
        }

        articleUrls.add(url);
      }
      pendingUrlsByArticleId.set(sourceArticleId, articleUrls);
      pendingUrlCount += articleUrls.size;

      // Handles the case where pending url count reaches flush threshold.
      if (pendingUrlCount >= flushThreshold) {
        void flush();
      }
    },
    flush
  };
};

export default createHotlinkBatcher;
