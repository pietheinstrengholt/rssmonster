import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SettingsFeedsOverview from '../src/components/model/SettingsFeedsOverview.vue';

// MOCK THE API MODULE, NOT AXIOS
vi.mock('../src/api/feeds', () => ({
  fetchFeeds: vi.fn().mockResolvedValue({
    data: { feeds: [] }
  })
}));

describe('SettingsFeedsOverview', () => {
  it('renders empty state', async () => {
    const wrapper = mount(SettingsFeedsOverview, {
      global: {
        stubs: {
          BootstrapIcon: true
        },
        mocks: {
          $store: {
            auth: { token: '' },
            data: {
              setSelectedCategoryId: vi.fn(),
              setSelectedFeedId: vi.fn(),
              setShowModal: vi.fn()
            }
          }
        }
      }
    });

    await nextTick();
    await nextTick();

    expect(wrapper.text()).toContain('No feeds found.');
  });
});
