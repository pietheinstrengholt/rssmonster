export const FEED_OVERVIEW_HEALTH = Object.freeze({
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
  reliabilityObservationCount = 0
) => {
  if (feed?.status === 'disabled') return FEED_OVERVIEW_HEALTH.DISABLED;

  const consecutiveFailures = Math.max(0, Number(feed?.consecutiveFailures) || 0);
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
    (!feed?.lastCrawlStatus && feed?.status === 'error')
  ) {
    return FEED_OVERVIEW_HEALTH.DEGRADED;
  }

  if (feed?.lastCrawlStatus === 'RECOVERED') {
    return FEED_OVERVIEW_HEALTH.RECOVERED;
  }

  return FEED_OVERVIEW_HEALTH.HEALTHY;
};

export default { FEED_OVERVIEW_HEALTH, deriveFeedOverviewHealth };
