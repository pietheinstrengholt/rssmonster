export const FEED_OVERVIEW_HEALTH = Object.freeze({
  NEW: 'NEW',
  HEALTHY: 'HEALTHY',
  RECOVERED: 'RECOVERED',
  DEGRADED: 'DEGRADED',
  FAILING: 'FAILING',
  DISABLED: 'DISABLED'
});

const FAILING_CONSECUTIVE_FAILURES = 3;
const DEGRADED_RELIABILITY_PCT = 90;
const MIN_RELIABILITY_OBSERVATIONS = 5;

// Derives one stable overview health label from current feed state and recent reliability.
export const deriveFeedOverviewHealth = (
  feed,
  reliabilityPct = null,
  reliabilityObservationCount = 0,
  articleCount = null
) => {
  if (feed?.status === 'disabled') return FEED_OVERVIEW_HEALTH.DISABLED;

  const consecutiveFailures = Math.max(0, Number(feed?.consecutiveFailures) || 0);
  const hasRecordedError = feed?.status === 'error' ||
    Math.max(0, Number(feed?.errorCount) || 0) > 0 ||
    consecutiveFailures > 0 ||
    Boolean(
      feed?.errorMessage ||
      feed?.errorSince ||
      feed?.lastCrawlErrorCategory
    );
  const hasRecordedCrawl = reliabilityObservationCount > 0 ||
    Boolean(
      feed?.lastCrawlAt ||
      feed?.lastCrawlStatus ||
      feed?.lastAttemptAt ||
      feed?.lastFetched ||
      feed?.lastSuccessAt ||
      feed?.lastSuccessfulCrawlAt ||
      feed?.lastFetchOutcome
    );
  if (
    articleCount !== null &&
    Math.max(0, Number(articleCount) || 0) === 0 &&
    !hasRecordedCrawl &&
    !hasRecordedError
  ) {
    return FEED_OVERVIEW_HEALTH.NEW;
  }

  if (
    feed?.lastCrawlStatus === 'FAILED' &&
    consecutiveFailures >= FAILING_CONSECUTIVE_FAILURES
  ) {
    return FEED_OVERVIEW_HEALTH.FAILING;
  }

  if (
    feed?.lastCrawlStatus === 'FAILED' ||
    (
      reliabilityObservationCount >= MIN_RELIABILITY_OBSERVATIONS &&
      reliabilityPct !== null &&
      reliabilityPct < DEGRADED_RELIABILITY_PCT
    ) ||
    (!feed?.lastCrawlStatus && hasRecordedError)
  ) {
    return FEED_OVERVIEW_HEALTH.DEGRADED;
  }

  if (feed?.lastCrawlStatus === 'RECOVERED') {
    return FEED_OVERVIEW_HEALTH.RECOVERED;
  }

  return FEED_OVERVIEW_HEALTH.HEALTHY;
};

export default { FEED_OVERVIEW_HEALTH, deriveFeedOverviewHealth };
