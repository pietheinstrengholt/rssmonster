import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsFeedDetails from '../src/components/settings/SettingsFeedDetails.vue';
import {
  fetchFeedCrawlResult,
  fetchFeedObservability,
  retryFeed
} from '../src/api/feeds.js';

vi.mock('../src/api/feeds.js', () => ({
  fetchFeedCrawlResult: vi.fn(),
  fetchFeedObservability: vi.fn(),
  retryFeed: vi.fn()
}));

// Creates a manually controlled promise for pending-button assertions.
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

// Returns a complete feed-details payload representative of all screen sections.
const observabilityFixture = (overrides = {}) => ({
  feed: {
    id: 8,
    feedName: 'Example Feed',
    url: 'https://example.com/feed.xml',
    feedType: 'rss',
    status: 'active',
    health: 'HEALTHY',
    lastCrawlAt: '2026-08-10T10:00:00.000Z',
    lastCrawlStatus: 'SUCCESS',
    lastCrawlErrorCategory: null,
    lastSuccessfulCrawlAt: '2026-08-10T10:00:00.000Z',
    consecutiveFailures: 0,
    ...overrides.feed
  },
  summary: {
    totalCrawls: 4,
    successful: 2,
    recovered: 1,
    failed: 1,
    successRatePct: 75,
    recoveryRatePct: 25,
    averageDurationMs: 820
  },
  failures: { TIMEOUT: 2, RATE_LIMITED: 1, NOT_FOUND: 0 },
  statistics: {
    articleCount: 278,
    articlesPerDay: 9.3,
    duplicateRatePct: 12.5,
    trustScore: 0.8,
    lastArticleAt: '2026-08-10T09:45:00.000Z'
  },
  crawlHealth: [
    { date: '2026-08-09', success: 2, recovered: 0, failed: 1 },
    { date: '2026-08-10', success: 1, recovered: 1, failed: 0 }
  ],
  recentCrawls: [
    { id: 92, status: 'SUCCESS', durationMs: 812, itemsFetched: 100, completedAt: '2026-08-10T10:00:00.000Z', errorCategory: null },
    { id: 91, status: 'RECOVERED', durationMs: 3800, itemsFetched: 100, completedAt: '2026-08-10T09:30:00.000Z', errorCategory: 'TIMEOUT' },
    { id: 90, status: 'FAILED', durationMs: 10000, itemsFetched: 0, completedAt: '2026-08-10T09:00:00.000Z', errorCategory: 'TIMEOUT' }
  ],
  ...overrides
});

// Mounts Feed Details after configuring its one page-level API response.
const mountDetails = async (payload = observabilityFixture()) => {
  fetchFeedObservability.mockResolvedValueOnce({ data: payload });
  const wrapper = mount(SettingsFeedDetails, { props: { feedId: 8 } });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('SettingsFeedDetails', () => {
  // Verifies the page snapshot populates identity, metrics, history, chart, failures, and statistics.
  it('renders the feed observability snapshot', async () => {
    const wrapper = await mountDetails();

    expect(fetchFeedObservability).toHaveBeenCalledWith(8);
    expect(wrapper.get('#feed-details-title').text()).toBe('Example Feed');
    expect(wrapper.text()).toContain('https://example.com/feed.xml');
    expect(wrapper.text()).toContain('Healthy');
    expect(wrapper.text()).toContain('75%');
    expect(wrapper.text()).toContain('820 ms');
    expect(wrapper.text()).toContain('Recent Crawl History');
    expect(wrapper.find('.feed-details__status--success').text()).toBe('SUCCESS');
    expect(wrapper.find('.feed-details__status--recovered').text()).toBe('RECOVERED');
    expect(wrapper.find('.feed-details__status--failed').text()).toBe('FAILED');
    expect(wrapper.text()).toContain('TIMEOUT');
    expect(wrapper.text()).toContain('278');
    expect(wrapper.text()).toContain('9.3');
    expect(wrapper.get('.feed-details__chart').attributes('aria-label'))
      .toContain('3 successful, 1 recovered, 1 failed');
    expect(fetchFeedCrawlResult).not.toHaveBeenCalled();
    expect(wrapper.get('.feed-details__retry-action').text()).toBe('Retry feed');
  });

  // Verifies pending retries disable the local action and reject duplicate clicks.
  it('disables the retry action while one request is running', async () => {
    const pendingRetry = deferred();
    retryFeed.mockReturnValueOnce(pendingRetry.promise);
    const wrapper = await mountDetails();
    const retryButton = wrapper.get('.feed-details__retry-action');

    await retryButton.trigger('click');
    await retryButton.trigger('click');

    expect(retryFeed).toHaveBeenCalledOnce();
    expect(retryButton.attributes('disabled')).toBeDefined();
    expect(retryButton.text()).toBe('Retrying…');

    fetchFeedObservability.mockResolvedValueOnce({ data: observabilityFixture() });
    pendingRetry.resolve({ data: {
      status: 'SUCCESS',
      crawlResult: { itemsFetched: 100, articlesNew: 3, articlesUpdated: 1 }
    } });
    await flushPromises();
    expect(retryButton.attributes('disabled')).toBeUndefined();
  });

  // Verifies completed domain outcomes remain non-exceptional and refresh observability.
  it.each([
    ['SUCCESS', 'Feed retry successful', '100 items fetched · 3 new · 1 updated', 'success'],
    ['RECOVERED', 'Feed recovered successfully', '100 items fetched · 3 new · 1 updated', 'warning'],
    ['FAILED', 'Feed is still failing', 'TIMEOUT', 'danger']
  ])('presents a completed %s retry and refreshes the snapshot', async (
    status,
    message,
    detail,
    tone
  ) => {
    retryFeed.mockResolvedValueOnce({ data: {
      status,
      crawlResult: {
        errorCategory: status === 'FAILED' ? 'TIMEOUT' : null,
        itemsFetched: status === 'FAILED' ? 0 : 100,
        articlesNew: status === 'FAILED' ? 0 : 3,
        articlesUpdated: status === 'FAILED' ? 0 : 1
      }
    } });
    fetchFeedObservability.mockResolvedValueOnce({ data: observabilityFixture({
      feed: { ...observabilityFixture().feed, health: status === 'FAILED' ? 'DEGRADED' : status }
    }) });
    const wrapper = await mountDetails();

    await wrapper.get('.feed-details__retry-action').trigger('click');
    await flushPromises();

    expect(retryFeed).toHaveBeenCalledWith(8);
    expect(fetchFeedObservability).toHaveBeenCalledTimes(2);
    const notice = wrapper.get('.feed-details__retry-notice');
    expect(notice.text()).toContain(message);
    expect(notice.text()).toContain(detail);
    expect(notice.classes()).toContain(tone === 'success'
      ? 'feed-details__retry-notice--success'
      : `app-notice--${tone}`);
  });

  // Verifies unexpected API failures use a concise local error without refreshing.
  it('reports an API failure without exposing backend details', async () => {
    retryFeed.mockRejectedValueOnce(new Error('sensitive backend stack'));
    const wrapper = await mountDetails();

    await wrapper.get('.feed-details__retry-action').trigger('click');
    await flushPromises();

    expect(wrapper.get('.feed-details__retry-notice').text())
      .toContain('Unable to retry feed');
    expect(wrapper.get('.feed-details__retry-notice').text())
      .toContain('Please try again.');
    expect(wrapper.text()).not.toContain('sensitive backend stack');
    expect(fetchFeedObservability).toHaveBeenCalledOnce();
  });

  // Verifies every backend health state is rendered as visible text without recalculation.
  it.each([
    ['RECOVERED', 'Recovered'],
    ['DEGRADED', 'Degraded'],
    ['FAILING', 'Failing'],
    ['DISABLED', 'Disabled']
  ])('renders backend %s health', async (health, label) => {
    const wrapper = await mountDetails(observabilityFixture({
      feed: {
        ...observabilityFixture().feed,
        health,
        consecutiveFailures: health === 'FAILING' ? 3 : 0,
        lastCrawlErrorCategory: health === 'FAILING' ? 'TIMEOUT' : null
      }
    }));

    expect(wrapper.get('.feed-details__metric').text()).toContain(label);
    if (health === 'FAILING') {
      expect(wrapper.get('.feed-details__health-context').text())
        .toContain('3 consecutive failures');
    }
    expect(wrapper.find('.feed-details__retry-action').exists())
      .toBe(health !== 'DISABLED');
  });

  // Verifies disabled feed state suppresses retry even when its persisted status is inconsistent.
  it('does not offer retry for a disabled feed', async () => {
    const wrapper = await mountDetails(observabilityFixture({
      feed: { ...observabilityFixture().feed, status: 'disabled', health: 'DISABLED' }
    }));

    expect(wrapper.find('.feed-details__retry-action').exists()).toBe(false);
    expect(retryFeed).not.toHaveBeenCalled();
  });

  // Verifies legacy error status does not hide recovery actions for degraded feeds.
  it('offers retry for a degraded feed with error status', async () => {
    const wrapper = await mountDetails(observabilityFixture({
      feed: { ...observabilityFixture().feed, status: 'error', health: 'DEGRADED' }
    }));

    expect(wrapper.get('.feed-details__retry-action').text()).toBe('Retry feed');
  });

  // Verifies no-history feeds use calm empty and neutral metric states.
  it('renders a feed without crawl history', async () => {
    const payload = observabilityFixture({
      summary: { successRatePct: null, averageDurationMs: null },
      failures: {},
      crawlHealth: [],
      recentCrawls: []
    });
    const wrapper = await mountDetails(payload);

    expect(wrapper.text()).toContain('No crawl history is available yet.');
    expect(wrapper.text()).toContain('No crawl observations in the last 30 days.');
    expect(wrapper.text()).toContain('No crawl failures in the last 30 days.');
    expect(wrapper.text()).toContain('—');
  });

  // Verifies crawl diagnostics load lazily and changing selection requests only that result.
  it('loads and changes selected crawl details', async () => {
    fetchFeedCrawlResult
      .mockResolvedValueOnce({ data: { crawl: {
        id: 91,
        requestedUrl: 'https://example.com/feed.xml',
        resolvedUrl: 'https://example.com/rss.xml',
        attemptCount: 2,
        errorCategory: 'TIMEOUT',
        attemptSummary: [{ type: 'ORIGINAL', outcome: 'timed_out', httpStatus: null }],
        articlesNew: 3,
        articlesUpdated: 1,
        articlesUnchanged: 96,
        articlesDuplicate: 0
      } } })
      .mockResolvedValueOnce({ data: { crawl: {
        id: 90,
        requestedUrl: 'https://example.com/feed.xml',
        attemptCount: 1,
        errorCategory: 'TIMEOUT',
        attemptSummary: []
      } } });
    const wrapper = await mountDetails();
    const selectionButtons = wrapper.findAll('.feed-details__crawl-select');

    await selectionButtons[1].trigger('click');
    await flushPromises();
    expect(fetchFeedCrawlResult).toHaveBeenNthCalledWith(1, 8, 91);
    expect(wrapper.get('.feed-details__selected').text()).toContain('https://example.com/rss.xml');
    expect(wrapper.get('.feed-details__attempts').text()).toContain('ORIGINAL');
    expect(wrapper.get('.feed-details__selected').text()).toContain('96');

    await selectionButtons[2].trigger('click');
    await flushPromises();
    expect(fetchFeedCrawlResult).toHaveBeenNthCalledWith(2, 8, 90);
    expect(wrapper.get('.feed-details__selected').text()).toContain('No attempt diagnostics.');
  });

  // Verifies selected crawl failures remain local to the expanded details panel.
  it('shows a local crawl-detail error without replacing the page', async () => {
    fetchFeedCrawlResult.mockRejectedValueOnce(new Error('offline'));
    const wrapper = await mountDetails();

    await wrapper.findAll('.feed-details__crawl-select')[0].trigger('click');
    await flushPromises();

    expect(wrapper.get('.feed-details__inline-error').text())
      .toBe('Could not load this crawl result.');
    expect(wrapper.get('#feed-details-title').text()).toBe('Example Feed');
  });

  // Verifies page-level failures and existing Back/Edit integration events.
  it('handles page errors and emits navigation actions', async () => {
    fetchFeedObservability.mockRejectedValueOnce({ response: { status: 404 } });
    const failedWrapper = mount(SettingsFeedDetails, { props: { feedId: 8 } });
    await flushPromises();
    expect(failedWrapper.get('[role="alert"]').text()).toContain('Feed not found.');

    const wrapper = await mountDetails();
    await wrapper.get('.feed-details__back').trigger('click');
    await wrapper.get('.feed-details__edit').trigger('click');
    expect(wrapper.emitted('back')).toHaveLength(1);
    expect(wrapper.emitted('edit')[0][0]).toMatchObject({ id: 8 });
  });
});
