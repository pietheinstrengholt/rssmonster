import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SmartFolderInsights from '../src/components/model/smartFolders/SmartFolderInsights.vue';
import { fetchSmartFolderInsights } from '../src/api/smartfolders';

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderInsights: vi.fn()
}));

// Mounts the extracted insights panel with decorative icons replaced.
const mountInsights = () => mount(SmartFolderInsights, {
  global: {
    stubs: { BootstrapIcon: true }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('SmartFolderInsights', () => {
  it('loads recommendations and emits the selected recommendation', async () => {
    const recommendation = {
      name: 'Security',
      query: 'tag:security limit:50',
      reason: 'Frequently read'
    };
    fetchSmartFolderInsights.mockResolvedValue({
      data: { recommendations: { smartFolders: [recommendation] } }
    });
    const wrapper = mountInsights();

    await wrapper.get('.smart-folders-toolbar button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Security');
    expect(wrapper.text()).toContain('Frequently read');
    await wrapper.get('.action-row .btn-add').trigger('click');
    expect(wrapper.emitted('add')?.[0]?.[0]).toEqual(recommendation);
  });

  it('renders the established empty result after loading', async () => {
    fetchSmartFolderInsights.mockResolvedValue({ data: {} });
    const wrapper = mountInsights();

    await wrapper.vm.fetchInsights();

    expect(wrapper.text()).toContain('No smart folder insights available yet.');
    expect(wrapper.vm.loading).toBe(false);
    expect(wrapper.vm.loaded).toBe(true);
  });

  it('renders the established error and permits retrying', async () => {
    fetchSmartFolderInsights
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: {} });
    const wrapper = mountInsights();

    await wrapper.vm.fetchInsights();
    expect(wrapper.text()).toContain('Failed to load smart folder insights.');

    await wrapper.get('.smart-folders-toolbar button').trigger('click');
    await flushPromises();

    expect(fetchSmartFolderInsights).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.error).toBeNull();
  });
});
