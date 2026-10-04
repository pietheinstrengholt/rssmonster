import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { offlineReading, offlineAccount } from '../src/services/offlineReading.js';
import { useOfflineReadingStore } from '../src/store/offlineReading.js';
import { useSelectionStore } from '../src/store/selection.js';
import { createPinia, setActivePinia } from 'pinia';
import api, { setOfflineReadOnly } from '../src/api/client.js';

let pinia;
let wrapper;
const dto = {
  id: 41, title: 'Downloaded article', publishedAt: '2026-10-01T12:00:00Z',
  content: '<p>The full downloaded article body.</p>', contentText: 'The full downloaded article body.',
  status: 'unread', favoriteInd: 1, feedId: 2, feed: { id: 2, name: 'Example feed' },
  tags: []
};
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const store = useOfflineReadingStore();
  store.account = offlineAccount(1);
  store.profile = { enabled: true, activeGeneration: 'ready' };
  store.setReadOnly(true);
  useSelectionStore().currentSelection.viewMode = 'full';
  vi.spyOn(offlineReading, 'loadSnapshot').mockResolvedValue([dto]);
});
afterEach(() => {
  wrapper?.unmount();
  setOfflineReadOnly(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloaded article rendering', () => {
  it('hydrates the existing feed and article renderer without fetching article bodies', async () => {
    const requests = vi.spyOn(api, 'get');
    wrapper = mount(ArticleFeed, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Downloaded articles');
    expect(wrapper.text()).toContain('Downloaded article');
    expect(wrapper.text()).toContain('The full downloaded article body.');
    expect(requests).not.toHaveBeenCalled();
    expect(offlineReading.loadSnapshot).toHaveBeenCalledWith(offlineAccount(1));
  });
  it('keeps snapshot read/saved state when an offline action is attempted', async () => {
    const adapter = vi.fn();
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = adapter;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      wrapper = mount(ArticleFeed, { global: { plugins: [pinia] } });
      await flushPromises();
      const actions = wrapper.findAll('button').find(item => item.attributes('aria-label') === 'Article actions');
      await actions.trigger('click');
      const save = wrapper.findAll('button').find(item => item.text() === 'Remove from saved');
      await save.trigger('click');
      await flushPromises();
      expect(adapter).not.toHaveBeenCalled();
      expect(wrapper.findAll('button').some(item => item.text() === 'Remove from saved')).toBe(true);
    } finally { api.defaults.adapter = originalAdapter; }
  });
  it('removes the displayed library after Clear offline data', async () => {
    wrapper = mount(ArticleFeed, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.text()).toContain('The full downloaded article body.');
    offlineReading.loadSnapshot.mockResolvedValue([]);
    vi.spyOn(offlineReading, 'clearSnapshot').mockResolvedValue();
    await useOfflineReadingStore().clearSnapshot();
    await flushPromises();
    expect(wrapper.text()).not.toContain('The full downloaded article body.');
  });
});
