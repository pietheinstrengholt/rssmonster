import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import SettingsEvents from '../src/components/settings/SettingsEvents.vue';

import { fetchEventsOverview } from '../src/api/settings';

vi.mock('../src/api/settings', () => ({
  fetchEventsOverview: vi.fn(),
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
