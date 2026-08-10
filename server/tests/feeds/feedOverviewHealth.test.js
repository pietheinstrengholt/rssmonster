import { describe, expect, it } from 'vitest';
import { deriveFeedOverviewHealth } from '../../services/feeds/feedOverviewHealth.js';

describe('feed overview health', () => {
  it.each([
    ['healthy latest crawl', { status: 'active', lastCrawlStatus: 'SUCCESS' }, 100, 10, 'HEALTHY'],
    ['recovered latest crawl', { status: 'active', lastCrawlStatus: 'RECOVERED' }, 90, 10, 'RECOVERED'],
    ['poor reliability', { status: 'active', lastCrawlStatus: 'SUCCESS' }, 89.9, 10, 'DEGRADED'],
    ['insufficient reliability history', { status: 'active', lastCrawlStatus: 'SUCCESS' }, 50, 2, 'HEALTHY'],
    ['intermittent failure', { status: 'active', lastCrawlStatus: 'FAILED', consecutiveFailures: 1 }, 95, 10, 'DEGRADED'],
    ['repeated failures', { status: 'active', lastCrawlStatus: 'FAILED', consecutiveFailures: 3 }, 95, 10, 'FAILING'],
    ['disabled feed', { status: 'disabled', lastCrawlStatus: 'SUCCESS' }, 50, 10, 'DISABLED'],
    ['new active feed', { status: 'active', lastCrawlStatus: null }, null, 0, 'HEALTHY'],
    ['legacy error without history', { status: 'error', lastCrawlStatus: null }, null, 0, 'DEGRADED']
  ])('classifies %s as %s', (
    _label,
    feed,
    reliabilityPct,
    observationCount,
    expected
  ) => {
    expect(
      deriveFeedOverviewHealth(feed, reliabilityPct, observationCount)
    ).toBe(expected);
  });
});
