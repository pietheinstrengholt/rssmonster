import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsCrawlStatistics from '../src/components/model/SettingsCrawlStatistics.vue';

const mocks = vi.hoisted(() => ({
  fetchCrawlStatistics: vi.fn()
}));

vi.mock('../src/api/settings', () => ({
  fetchCrawlStatistics: mocks.fetchCrawlStatistics
}));

// This function mounts the crawl statistics settings overview.
const mountOverview = () => mount(SettingsCrawlStatistics, {
  global: {
    stubs: {
      BootstrapIcon: true
    }
  }
});

describe('SettingsCrawlStatistics', () => {
  beforeEach(() => {
    mocks.fetchCrawlStatistics.mockReset();
  });

  it('renders daily crawl totals returned by the settings API', async () => {
    mocks.fetchCrawlStatistics.mockResolvedValue({
      data: {
        crawlStatistics: [{
          date: '2026-07-15',
          newArticles: 12,
          updatedArticles: 4,
          completedCrawls: 3,
          failedCrawls: 1
        }]
      }
    });

    const wrapper = mountOverview();
    await flushPromises();

    expect(mocks.fetchCrawlStatistics).toHaveBeenCalledWith({ days: 30 });
    expect(wrapper.text()).toContain('Daily totals');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('4');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('1');
  });

  it('renders the empty state when no terminal crawls exist in the selected period', async () => {
    mocks.fetchCrawlStatistics.mockResolvedValue({
      data: { crawlStatistics: [] }
    });

    const wrapper = mountOverview();
    await flushPromises();

    expect(wrapper.text()).toContain('No crawl statistics are available for this period.');
  });

  it('renders an error state when the settings API request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetchCrawlStatistics.mockRejectedValue(new Error('Request failed'));

    const wrapper = mountOverview();
    await flushPromises();

    expect(wrapper.text()).toContain('Unable to load crawl statistics. Please try again.');
    consoleError.mockRestore();
  });
});
