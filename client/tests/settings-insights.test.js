import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import SettingsIslands from '../src/components/model/SettingsIslands.vue';
import SettingsTopics from '../src/components/model/SettingsTopics.vue';
import { fetchIslandsOverview, fetchTopicsOverview } from '../src/api/settings';

vi.mock('../src/api/settings', () => ({
  fetchIslandsOverview: vi.fn(),
  fetchTopicsOverview: vi.fn()
}));

let wrapper;

// Mounts an insights component while replacing decorative icons.
const mountInsights = (component) => {
  wrapper = mount(component, {
    global: {
      stubs: { BootstrapIcon: true }
    }
  });
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('SettingsIslands', () => {
  // Verifies island totals, evidence, source articles, and topic connections are rendered.
  it('loads and renders populated island insights', async () => {
    fetchIslandsOverview.mockResolvedValue({
      data: {
        userId: 12,
        totals: {
          islandCount: 1,
          islandArticles: 4,
          nonIslandArticles: 6,
          totalArticles: 10,
          islandCoveragePercent: 40,
          nonIslandCoveragePercent: 60
        },
        islands: [{
          id: 2,
          label: '',
          sourceArticleCount: 2,
          topicCount: 1,
          relatedArticleCount: 2,
          effectiveWeight: 0.75,
          evidenceSignalCount: 3,
          archivedInd: false,
          sourceArticles: [{
            id: 20,
            title: 'Source story',
            url: 'https://example.com/source',
            feedName: '',
            publishedAt: '2026-07-01T00:00:00.000Z',
            evidence: [
              { type: 'favorite', label: 'Favorite' },
              { type: 'click', label: 'Clicked' },
              { type: 'negative', label: 'Dismissed' },
              { type: 'other', label: 'Other' }
            ],
            connectionTopics: [{ id: 5, name: 'AI' }]
          }],
          relatedArticles: [
            { id: 20, isPopulationSource: true },
            {
              id: 21,
              title: 'Related story',
              url: 'https://example.com/related',
              feedName: 'Daily',
              publishedAt: 'invalid',
              isPopulationSource: false,
              connectionTopics: [{ id: 5, name: 'AI' }]
            }
          ]
        }]
      }
    });

    mountInsights(SettingsIslands);
    await flushPromises();

    expect(fetchIslandsOverview).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Island #2');
    expect(wrapper.text()).toContain('Showing 1 of 2');
    expect(wrapper.text()).toContain('0.75');
    expect(wrapper.text()).toContain('Favorite');
    expect(wrapper.text()).toContain('Related story');
    expect(wrapper.text()).toContain('Unknown feed');
    expect(wrapper.text()).toContain('Unknown date');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('40');
  });

  // Verifies formatter branches and refresh replacement behavior.
  it('formats island values and refreshes an empty response', async () => {
    fetchIslandsOverview.mockResolvedValue({
      data: { userId: null, islands: [], totals: null }
    });
    mountInsights(SettingsIslands);
    await flushPromises();

    expect(wrapper.vm.formatPercent(null)).toBe('0.0%');
    expect(wrapper.vm.formatNormalizedAffinity(undefined)).toBe('0.00');
    expect(wrapper.vm.formatCountLabel(1, 'topic')).toBe('1 topic');
    expect(wrapper.vm.formatCountLabel(2, 'topic')).toBe('2 topics');
    expect(wrapper.vm.evidenceBadgeClass('deepRead')).toBe('text-bg-info');
    expect(wrapper.vm.formatDate(null)).toBe('Unknown date');
    expect(wrapper.text()).toContain('do not have any interest islands');

    await wrapper.get('.settings-refresh-button').trigger('click');
    await flushPromises();
    expect(fetchIslandsOverview).toHaveBeenCalledTimes(2);
  });

  // Verifies overview failures clear loading state and display the error.
  it('renders an island loading failure', async () => {
    fetchIslandsOverview.mockRejectedValue(new Error('offline'));
    mountInsights(SettingsIslands);
    await flushPromises();

    expect(wrapper.vm.loading).toBe(false);
    expect(wrapper.text()).toContain('Failed to load islands overview.');
  });
});

describe('SettingsTopics', () => {
  // Verifies topic metrics, buckets, statuses, events, and recent topics are rendered.
  it('loads and renders populated topic insights', async () => {
    fetchTopicsOverview.mockResolvedValue({
      data: {
        totals: {
          activeEventCount: 2,
          topicCount: 1,
          eventLinkedArticles: 5,
          topicCoveragePercent: 62.5,
          unclusteredArticles: 3,
          eventCount: 2,
          unassignedArticles: 1,
          eventReuseRatio: 50,
          newEventRatio: 50,
          averageArticlesPerEvent: 2.5,
          largestEventSize: 4,
          topicsWithEvents: 1,
          eventsLinkedToTopics: 2,
          eventsWithoutTopics: 0,
          articlesLinkedToTopics: 5,
          averageEventsPerTopic: 2
        },
        eventSizeBuckets: [
          { bucket: '1', count: 1 },
          { bucket: '2-5', count: 2 }
        ],
        eventStatuses: [{ status: 'active', count: 2 }],
        topicTypes: [{ topicType: 'behavioral', count: 1 }],
        events: [
          {
            id: 3,
            name: '',
            articleCount: 4,
            topicCount: 1,
            status: 'archived',
            updatedAt: '2026-07-01T00:00:00.000Z'
          }
        ],
        topics: [{
          id: 6,
          name: 'Artificial intelligence',
          linkedEventCount: 2,
          linkedArticleCount: 5,
          topicType: 'hybrid',
          lastActivityAt: null
        }]
      }
    });

    mountInsights(SettingsTopics);
    await flushPromises();

    expect(fetchTopicsOverview).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('62.5%');
    expect(wrapper.text()).toContain('Events with 1 article');
    expect(wrapper.text()).toContain('Events with 2-5 articles');
    expect(wrapper.text()).toContain('Event #3');
    expect(wrapper.text()).toContain('Artificial intelligence');
    expect(wrapper.text()).toContain('No activity yet');
    expect(wrapper.get('.text-bg-secondary').text()).toContain('archived');
  });

  // Verifies empty defaults and all classification formatter branches.
  it('renders empty topic insights and formats classifications', async () => {
    fetchTopicsOverview.mockResolvedValue({ data: {} });
    mountInsights(SettingsTopics);
    await flushPromises();

    expect(wrapper.text()).toContain('No event sizes yet.');
    expect(wrapper.text()).toContain('No events yet.');
    expect(wrapper.text()).toContain('No topics yet.');
    expect(wrapper.text()).toContain('will appear here');
    expect(wrapper.vm.formatPercent(undefined)).toBe('0.0%');
    expect(wrapper.vm.formatNumber(null)).toBe('0.0');
    expect(wrapper.vm.formatDate('invalid')).toBe('No activity yet');
    expect(wrapper.vm.statusClass('active')).toBe('text-bg-success');
    expect(wrapper.vm.topicTypeClass('event')).toBe('text-bg-primary');
    expect(wrapper.vm.topicTypeClass('behavioral')).toBe('text-bg-info');
    expect(wrapper.vm.topicTypeClass('hybrid')).toBe('text-bg-success');
    expect(wrapper.vm.topicTypeClass('unknown')).toBe('text-bg-secondary');
  });

  // Verifies overview failures clear loading state and display the error.
  it('renders a topic loading failure and can retry', async () => {
    fetchTopicsOverview.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {} });
    mountInsights(SettingsTopics);
    await flushPromises();

    expect(wrapper.vm.loading).toBe(false);
    expect(wrapper.text()).toContain('Failed to load events and topics overview.');

    await wrapper.get('.settings-refresh-button').trigger('click');
    await flushPromises();
    expect(fetchTopicsOverview).toHaveBeenCalledTimes(2);
  });
});
