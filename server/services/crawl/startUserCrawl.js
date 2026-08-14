const assertUserId = userId => {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new TypeError('A positive authenticated userId is required to start a crawl.');
  }
};

// Starts a user crawl in the background and resolves once its run is created or reused.
export const createStartUserCrawl = runUserCrawl => async (
  userId,
  { triggerType = 'api', onComplete, onError } = {}
) => {
  assertUserId(userId);

  let startSettled = false;
  let resolveStart;
  let rejectStart;
  const startResult = new Promise((resolve, reject) => {
    resolveStart = resolve;
    rejectStart = reject;
  });

  const settleStart = result => {
    if (startSettled) return;
    startSettled = true;
    resolveStart(result);
  };

  const completion = Promise.resolve().then(() => runUserCrawl(userId, {
    triggerType,
    onCrawlStarted: settleStart
  }));

  completion.then(result => {
    settleStart({
      userId,
      crawlRunId: result.crawlRunId ?? null,
      status: result.reason === 'crawl_already_running' ? 'running' : 'completed',
      reused: Boolean(result.reused),
      reason: result.reason ?? null
    });
    return onComplete?.(result);
  }, error => {
    if (!startSettled) {
      startSettled = true;
      rejectStart(error);
    }
    return onError?.(error);
  }).catch(() => {});

  return startResult;
};

