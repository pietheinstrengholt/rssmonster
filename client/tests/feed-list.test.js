import { beforeEach, describe, it, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import SettingsFeedsOverview from '../src/components/settings/SettingsFeedsOverview.vue';
import { fetchFeeds } from '../src/api/feeds';
import { useUiStore } from '../src/store/ui.js';
import { useOverviewStore } from '../src/store/overview.js';

// MOCK THE API MODULE, NOT AXIOS
vi.mock('../src/api/feeds', () => ({
  fetchFeeds: vi.fn(),
  recalculateFeedTrust: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchFeeds.mockResolvedValue({ data: { feeds: [] } });
});

// Mounts the overview with its real Pinia dependencies and icon boundary stubbed.
const mountOverview = () => mount(SettingsFeedsOverview, {
  global: {
    plugins: [createPinia()],
    stubs: {
      BootstrapIcon: true
    }
  }
});

describe('SettingsFeedsOverview', () => {
  it('opens the shared Add feed form from an empty subscription list', async () => {
    const wrapper = mountOverview();
    await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Add feed').trigger('click');
    expect(useUiStore().showModal).toBe('NewFeed');
    expect(wrapper.text()).toContain('No feeds found.');
    wrapper.unmount();
  });

  it('refreshes the feed list after a subscription is added without losing the search', async () => {
    const wrapper = mountOverview();
    await flushPromises();
    await wrapper.get('input[type="search"]').setValue('New subscription');
    fetchFeeds.mockResolvedValue({ data: { feeds: [{ id: 99, feedName: 'New subscription' }] } });
    useOverviewStore().addCategory({ id: 1, name: 'News', feeds: [] });
    useOverviewStore().addFeed(1, { id: 99, feedName: 'New subscription' });
    await flushPromises();
    expect(fetchFeeds).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(wrapper.get('input[type="search"]').element.value).toBe('New subscription');
    expect(wrapper.get('tbody').text()).toContain('New subscription');
    wrapper.unmount();
  });

  it('keeps recalculation inside the keyboard-accessible Maintenance menu', async () => {
    const wrapper = mountOverview();
    await flushPromises();
    const trigger = wrapper.findAll('button').find(button => button.text() === 'Maintenance');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    expect(trigger.attributes('aria-expanded')).toBe('true');
    const action = wrapper.get('[role="menuitem"]');
    expect(action.text()).toBe('Recalculate Scores');
    expect(action.attributes('disabled')).toBeDefined();
    const parentKeydown = vi.fn();
    wrapper.element.addEventListener('keydown', parentKeydown);
    await trigger.trigger('keydown', { key: 'Escape' });
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(parentKeydown).not.toHaveBeenCalled();
    await trigger.trigger('keydown', { key: 'Escape' });
    expect(parentKeydown).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('renders empty state', async () => {
    const wrapper = mountOverview();

    await nextTick();
    await nextTick();

    expect(wrapper.text()).toContain('No feeds found.');
  });

  // Verifies the health overview renders backend states, meters, crawl times, and accents.
  it('renders crawl health rows without additional feed requests', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-10T09:00:00.000Z').getTime());
    fetchFeeds.mockResolvedValue({
      data: {
        feeds: [
          {
            id: 1,
            feedName: 'Recovered Feed',
            health: 'RECOVERED',
            reliabilityPct: 91,
            lastCrawlAt: '2026-08-10T08:55:00.000Z',
            feedTrust: 0.8
          },
          {
            id: 2,
            feedName: 'Degraded Feed',
            health: 'DEGRADED',
            reliabilityPct: 84,
            lastCrawlAt: null,
            feedTrust: null
          },
          {
            id: 3,
            feedName: 'Failing Feed',
            health: 'FAILING',
            reliabilityPct: null,
            lastCrawlAt: null,
            feedTrust: 0.2
          }
        ]
      }
    });

    const wrapper = mountOverview();
    await nextTick();
    await nextTick();

    expect(fetchFeeds).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Recovered');
    expect(wrapper.text()).toContain('Degraded');
    expect(wrapper.text()).toContain('Failing');
    expect(wrapper.text()).toContain('91%');
    expect(wrapper.text()).toContain('84%');
    expect(wrapper.text()).toContain('5m ago');
    expect(wrapper.text()).toContain('Never');
    expect(wrapper.findAll('.feeds-reliability-bar')).toHaveLength(2);
    expect(wrapper.find('.feeds-table-row--recovered').exists()).toBe(true);
    expect(wrapper.find('.feeds-table-row--degraded').exists()).toBe(true);
    expect(wrapper.find('.feeds-table-row--failing').exists()).toBe(true);

    const recoveredRow = wrapper.find('.feeds-table-row--recovered');
    const rowClick = vi.fn();
    recoveredRow.element.addEventListener('click', rowClick);
    await recoveredRow.find('.feeds-edit-button').trigger('click');
    expect(rowClick).not.toHaveBeenCalled();
  });
});
