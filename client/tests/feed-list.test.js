import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import SettingsFeedsOverview from '../src/components/settings/SettingsFeedsOverview.vue';
import { fetchFeeds } from '../src/api/feeds';

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
