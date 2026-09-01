import { describe, expect, it } from 'vitest';
import { deriveFeedOverviewHealth } from '../../services/feeds/feedOverviewHealth.js';

describe('feed overview health', () => {
  it.each([
    ['healthy latest crawl', { status: 'active', lastCrawlStatus: 'SUCCESS' }, 100, 10, 5, 'HEALTHY'],
    ['recovered latest crawl', { status: 'active', lastCrawlStatus: 'RECOVERED' }, 90, 10, 5, 'RECOVERED'],
    ['poor reliability', { status: 'active', lastCrawlStatus: 'SUCCESS' }, 89.9, 10, 5, 'DEGRADED'],
    ['insufficient reliability history', { status: 'active', lastCrawlStatus: 'SUCCESS' }, 50, 2, 5, 'HEALTHY'],
    ['intermittent failure', { status: 'active', lastCrawlStatus: 'FAILED', consecutiveFailures: 1 }, 95, 10, 0, 'DEGRADED'],
    ['repeated failures', { status: 'active', lastCrawlStatus: 'FAILED', consecutiveFailures: 3 }, 95, 10, 0, 'FAILING'],
    ['disabled feed', { status: 'disabled', lastCrawlStatus: 'SUCCESS' }, 50, 10, 0, 'DISABLED'],
    ['new active feed', { status: 'active', lastCrawlStatus: null }, null, 0, 0, 'NEW'],
    ['feed with articles but no crawl history', { status: 'active' }, null, 0, 1, 'HEALTHY'],
    ['feed with an old crawl marker', { status: 'active', lastCrawlAt: new Date() }, null, 0, 0, 'HEALTHY'],
    ['active feed with a recorded error', { status: 'active', errorCount: 1 }, null, 0, 0, 'DEGRADED'],
    ['legacy error without history', { status: 'error', lastCrawlStatus: null }, null, 0, 0, 'DEGRADED']
  ])('classifies %s as %s', (
    _label,
    feed,
    reliabilityPct,
    observationCount,
    articleCount,
    expected
  ) => {
    expect(
      deriveFeedOverviewHealth(
        feed,
        reliabilityPct,
        observationCount,
        articleCount
      )
    ).toBe(expected);
  });
});
