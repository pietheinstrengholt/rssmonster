import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import SettingsEvents from '../src/components/settings/SettingsEvents.vue';
import SettingsIslands from '../src/components/settings/SettingsIslands.vue';

import { fetchIslandsOverview, fetchEventsOverview, recalculateIslands } from '../src/api/settings';

vi.mock('../src/api/settings', () => ({
  fetchIslandsOverview: vi.fn(),
  fetchEventsOverview: vi.fn(),
  recalculateIslands: vi.fn()
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
  // Verifies island totals, evidence, source articles, and direct matches are rendered.
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
          label: 'Deterministic island',
          generatedLabel: 'Generated island',
          sourceArticleCount: 2,
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
            ]
          }],
          relatedArticles: [
            { id: 20, isPopulationSource: true },
            {
              id: 21,
              title: 'Related story',
              url: 'https://example.com/related',
              feedName: 'Daily',
              publishedAt: 'invalid',
              isPopulationSource: false
            }
          ]
        }]
      }
    });

    mountInsights(SettingsIslands);
    await flushPromises();

    expect(fetchIslandsOverview).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Generated island');
    expect(wrapper.text()).not.toContain('Deterministic island');
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
    expect(wrapper.vm.formatCountLabel(1, 'event')).toBe('1 event');
    expect(wrapper.vm.formatCountLabel(2, 'event')).toBe('2 events');
    expect(wrapper.vm.evidenceBadgeClass('deepRead')).toBe('app-status-badge--info');
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

  it('recalculates islands and refreshes the overview', async () => {
    let resolveRecalculation;
    fetchIslandsOverview.mockResolvedValue({ data: { islands: [] } });
    recalculateIslands.mockImplementation(() => new Promise(resolve => {
      resolveRecalculation = resolve;
    }));
    mountInsights(SettingsIslands);
    await flushPromises();

    await wrapper.get('.settings-recalculate-button').trigger('click');

    expect(wrapper.get('.settings-recalculate-button').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('.settings-recalculate-button').text()).toContain('Recalculating…');
    expect(wrapper.get('.settings-refresh-button').element.disabled).toBe(true);

    resolveRecalculation({
      data: { islandCount: 2, rescoredArticleCount: 5 }
    });
    await flushPromises();

    expect(recalculateIslands).toHaveBeenCalledOnce();
    expect(fetchIslandsOverview).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Recalculated 2 islands and rescored 5 articles.');
    expect(wrapper.vm.recalculating).toBe(false);
  });

  it('reports island recalculation failures without replacing the overview', async () => {
    fetchIslandsOverview.mockResolvedValue({ data: { islands: [] } });
    recalculateIslands.mockRejectedValue(new Error('failed'));
    mountInsights(SettingsIslands);
    await flushPromises();

    await wrapper.get('.settings-recalculate-button').trigger('click');
    await flushPromises();

    expect(fetchIslandsOverview).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Failed to recalculate interest islands.');
    expect(wrapper.vm.recalculating).toBe(false);
  });

  it('reports zero recalculation counts when the response omits them', async () => {
    fetchIslandsOverview.mockResolvedValue({ data: { islands: [] } });
    recalculateIslands.mockResolvedValue({});
    mountInsights(SettingsIslands);
    await flushPromises();

    await wrapper.get('.settings-recalculate-button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Recalculated 0 islands and rescored 0 articles.');
  });
});

describe('SettingsEvents', () => {
  // Verifies Event metrics, buckets, statuses, and recent Events are rendered.
  it('loads and renders populated event insights', async () => {
    fetchEventsOverview.mockResolvedValue({
      data: {
        totals: {
          activeEventCount: 2,
          eventLinkedArticles: 5,
          unclusteredArticles: 3,
          eventCount: 2,
          unassignedArticles: 1,
          eventReuseRatio: 50,
          newEventRatio: 50,
          averageArticlesPerEvent: 2.5,
          largestEventSize: 4,

        },
        eventSizeBuckets: [
          { bucket: '1', count: 1 },
          { bucket: '2-5', count: 2 }
        ],
        eventStatuses: [{ status: 'active', count: 2 }],
        events: [
          {
            id: 3,
            name: 'Deterministic event',
            generatedName: 'Generated event',
            articleCount: 4,
            status: 'archived',
            updatedAt: '2026-07-01T00:00:00.000Z'
          }
        ]
      }
    });

    mountInsights(SettingsEvents);
    await flushPromises();

    expect(fetchEventsOverview).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Events with 1 article');
    expect(wrapper.text()).toContain('Events with 2-5 articles');
    expect(wrapper.text()).toContain('Generated event');
    expect(wrapper.text()).not.toContain('Deterministic event');
    expect(wrapper.get('.app-status-badge--neutral').text()).toContain('archived');
  });

  // Verifies empty defaults and all classification formatter branches.
  it('renders empty event insights and formats classifications', async () => {
    fetchEventsOverview.mockResolvedValue({ data: {} });
    mountInsights(SettingsEvents);
    await flushPromises();

    expect(wrapper.text()).toContain('No event sizes yet.');
    expect(wrapper.text()).toContain('No events yet.');
    expect(wrapper.text()).toContain('will appear here');
    expect(wrapper.vm.formatPercent(undefined)).toBe('0.0%');
    expect(wrapper.vm.formatNumber(null)).toBe('0.0');
    expect(wrapper.vm.formatDate('invalid')).toBe('No activity yet');
    expect(wrapper.vm.statusClass('active')).toBe('app-status-badge--success');
  });

  // Verifies overview failures clear loading state and display the error.
  it('renders a event loading failure and can retry', async () => {
    fetchEventsOverview.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {} });
    mountInsights(SettingsEvents);
    await flushPromises();

    expect(wrapper.vm.loading).toBe(false);
    expect(wrapper.text()).toContain('Failed to load events overview.');

    await wrapper.get('.settings-refresh-button').trigger('click');
    await flushPromises();
    expect(fetchEventsOverview).toHaveBeenCalledTimes(2);
  });
});
