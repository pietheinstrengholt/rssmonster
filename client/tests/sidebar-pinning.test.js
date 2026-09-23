import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import UpdateFeed from '../src/components/dialogs/feeds/UpdateFeed.vue';
import UpdateCategory from '../src/components/dialogs/categories/UpdateCategory.vue';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';
import api from '../src/api/client';

vi.mock('../src/api/client', () => ({ setAuthToken: vi.fn(), default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
let sidebar;
let dialog;
let overview;
let ui;
let type;
const item = () => type === 'feed' ? overview.categories[0].feeds[0] : overview.categories[0];
const mountEditor = (itemType, pinned) => {
  type = itemType;
  const pinia = createPinia();
  setActivePinia(pinia);
  overview = useOverviewStore();
  ui = useUiStore();
  const selection = useSelectionStore();
  overview.categories = [{ id: 10, name: 'Technology', iconName: 'cpu-fill', clusteringBehavior: null,
    pinned: type === 'category' && pinned, unreadCount: 5, readCount: 4, feeds: [
      { id: 101, categoryId: 10, feedName: 'Example', url: 'https://example.com/rss', status: 'active',
        pinned: type === 'feed' && pinned, unreadCount: 5, readCount: 4 }
    ] }];
  selection.currentSelection.categoryId = 10;
  selection.currentSelection.feedId = type === 'feed' ? 101 : '%';
  selection.currentSelection.status = 'unread';
  ui.setShowModal(type === 'feed' ? 'UpdateFeed' : 'UpdateCategory');
  const options = { global: { plugins: [pinia], stubs: { BootstrapIcon: true } } };
  sidebar = mount(Sidebar, options);
  dialog = mount(type === 'feed' ? UpdateFeed : UpdateCategory, options);
};
const checkbox = () => dialog.get(type === 'feed' ? '#update-feed-pinned' : '#category-pinned');
const save = () => dialog.get('.base-dialog__button--primary');
const hasPinned = () => sidebar.find('section[aria-label="Pinned"]').exists();

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockImplementation(async (_url, payload) => ({ data: type === 'feed'
    ? { feed: { ...item(), ...payload } } : { ...item(), ...payload } }));
});
afterEach(() => { sidebar?.unmount(); dialog?.unmount(); vi.restoreAllMocks(); });

describe('Pinning through edit dialogs', () => {
  it.each([['feed', false], ['feed', true], ['category', false], ['category', true]])('saves a %s pin change from %s', async (itemType, initial) => {
    mountEditor(itemType, initial);
    expect(checkbox().element.checked).toBe(initial);
    expect(sidebar.find('[aria-haspopup="menu"]').exists()).toBe(false);
    expect(hasPinned()).toBe(initial);
    await checkbox().setValue(!initial);
    expect(item().pinned).toBe(initial);
    expect(save().element.disabled).toBe(false);
    await save().trigger('click');
    await flushPromises();
    expect(api.put).toHaveBeenCalledWith(type === 'feed' ? '/feeds/101' : '/categories/10', expect.objectContaining({ pinned: !initial }));
    expect(item().pinned).toBe(!initial);
    expect(hasPinned()).toBe(!initial);
    expect(sidebar.find('[aria-haspopup="menu"]').exists()).toBe(false);
    expect(sidebar.get('[id="10"]').text()).toContain('Technology');
    expect(sidebar.get('[id="101"]').text()).toContain('5/9');
    expect(ui.showModal).toBe('');
  });

  it.each(['feed', 'category'])('discards unsaved %s pin changes', async itemType => {
    mountEditor(itemType, false);
    await checkbox().setValue(true);
    await dialog.get('.base-dialog__button--secondary').trigger('click');
    expect(item().pinned).toBe(false);
    expect(hasPinned()).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
    expect(ui.showModal).toBe('');
  });

  it.each(['feed', 'category'])('waits for a %s save, preserves state on failure and allows retry', async itemType => {
    mountEditor(itemType, false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let reject;
    api.put.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await checkbox().setValue(true);
    await save().trigger('click');
    expect(checkbox().element.matches(':disabled')).toBe(true);
    expect(hasPinned()).toBe(false);
    expect(save().element.disabled).toBe(true);
    reject(new Error('offline'));
    await flushPromises();
    expect(item().pinned).toBe(false);
    expect(hasPinned()).toBe(false);
    expect(ui.showModal).not.toBe('');
    await save().trigger('click');
    await flushPromises();
    expect(hasPinned()).toBe(true);
  });
});
