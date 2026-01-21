import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FeedsOverview from '../src/components/Modal/FeedsOverview.vue';

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { feeds: [] } })
  }
}));

describe('FeedsOverview', () => {
  it('renders empty state', async () => {
    const wrapper = mount(FeedsOverview, {
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