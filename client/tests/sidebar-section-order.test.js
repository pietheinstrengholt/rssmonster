import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import SidebarSectionTitle from '../src/components/sidebar/SidebarSectionTitle.vue';
import SidebarConfigurationModal from '../src/components/dialogs/SidebarConfigurationModal.vue';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';
import api from '../src/api/client';

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn(),
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }
}));

let wrapper;
let dialog;
let pinia;
let overview;
let selection;
let ui;
const defaults = ['Smart Folders', 'All feeds', 'Top tags in Unread', 'Categories'];
const custom = ['categories', 'top-tags', 'all-feeds', 'smart-folders'];
const titles = () => wrapper.findAllComponents(SidebarSectionTitle).map(heading => heading.text());
const button = label => wrapper.findAll('button').find(item => item.text().trim() === label);
const mountSidebar = (sectionOrder, pinned = false) => {
  pinia = createPinia();
  setActivePinia(pinia);
  overview = useOverviewStore();
  selection = useSelectionStore();
  ui = useUiStore();
  ui.setSidebarSettings({ ...ui.sidebarSettings, sectionOrder });
  overview.categories = [{ id: 10, name: 'Technology', pinned, unreadCount: 5, readCount: 4, favoriteCount: 2, feeds: [
    { id: 101, categoryId: 10, feedName: 'Example', pinned, unreadCount: 5, readCount: 4, favoriteCount: 2 }
  ] }];
  overview.smartFolders = [{ id: 30, name: 'Research', ArticleCount: 11, query: 'tag:research' }];
  overview.topTags = [{ name: 'javascript', count: 7 }];
  selection.currentSelection.categoryId = 10;
  selection.currentSelection.feedId = 101;
  selection.currentSelection.status = 'unread';
  wrapper = mount(Sidebar, { global: { plugins: [pinia], stubs: { BootstrapIcon: true } } });
};

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ data: {} });
  api.put.mockImplementation(async (_url, body) => ({ data: body }));
});
afterEach(() => { wrapper?.unmount(); dialog?.unmount(); dialog = null; });

describe('Sidebar section order', () => {
  it('keeps the existing order when no preference exists', () => {
    mountSidebar();
    expect(titles()).toEqual(defaults);
  });

  it('puts Categories first and Smart Folders last while keeping legacy Pinned placement and global actions fixed', () => {
    mountSidebar(custom, true);
    expect(titles()).toEqual(['Pinned', 'Categories', 'Top tags in Unread', 'All feeds', 'Smart Folders']);
    const pinned = wrapper.get('section[aria-label="Pinned"]').element;
    for (const label of ['Add new feed', 'Refresh feeds', 'Mark as read']) {
      expect(button(label).element.compareDocumentPosition(pinned) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const last = wrapper.findAllComponents(SidebarSectionTitle).at(-1).element;
    expect(last.compareDocumentPosition(button('Add category').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves Pinned with the saved order and retains shortcut selection and counts', async () => {
    mountSidebar([...custom, 'pinned'], true);
    expect(titles()).toEqual(['Categories', 'Top tags in Unread', 'All feeds', 'Smart Folders', 'Pinned']);
    const shortcut = wrapper.get('[id="pinned-feed-101"]');
    expect(shortcut.text()).toContain('5/9');
    expect(shortcut.attributes('aria-current')).toBe('page');
    ui.setSidebarSettings({ ...ui.sidebarSettings, sectionOrder: ['categories', 'pinned', ...custom.slice(1)] });
    await flushPromises();
    expect(titles()).toEqual(['Categories', 'Pinned', 'Top tags in Unread', 'All feeds', 'Smart Folders']);
    expect(wrapper.get('[id="pinned-feed-101"]').element).toBe(shortcut.element);
    await shortcut.trigger('click');
    expect(selection.currentSelection.feedId).toBe('101');
    expect(wrapper.get('[id="101"]').text()).toContain('Example');
  });

  it('defaults Pinned to the top and hides it when no items are pinned', async () => {
    mountSidebar(undefined, true);
    expect(titles()).toEqual(['Pinned', ...defaults]);
    overview.categories[0].pinned = false;
    overview.categories[0].feeds[0].pinned = false;
    await flushPromises();
    expect(titles()).toEqual(defaults);
  });

  it.each([null, 'categories', {}, 42, [], ['banana', 'Pinned']])('falls back safely for %j', value => {
    mountSidebar(value);
    expect(titles()).toEqual(defaults);
  });

  it('ignores duplicate and unknown IDs and appends missing sections', () => {
    mountSidebar(['categories', 'categories', 'banana', 'smart-folders']);
    expect(titles()).toEqual(['Categories', 'Smart Folders', 'All feeds', 'Top tags in Unread']);
  });

  it('reacts to settings changes while preserving counts, selection and contextual headings', async () => {
    mountSidebar();
    const original = wrapper.get('[id="101"]');
    expect(original.text()).toContain('5/9');
    expect(original.attributes('aria-current')).toBe('page');
    ui.setSidebarSettings({ ...ui.sidebarSettings, sectionOrder: custom });
    await flushPromises();
    expect(titles()).toEqual(['Categories', 'Top tags in Unread', 'All feeds', 'Smart Folders']);
    expect(wrapper.get('[id="101"]').element).toBe(original.element);
    expect(wrapper.get('[id="101"]').text()).toContain('5/9');
    expect(wrapper.get('[id="101"]').attributes('aria-current')).toBe('page');
    selection.currentSelection.status = 'favorite';
    await flushPromises();
    expect(titles()[1]).toBe('Top tags in Favorites');
    expect(wrapper.get('[id="101"]').text()).toContain('2/9');
    ui.setSidebarSettings({ ...ui.sidebarSettings, showTotalCount: false });
    await flushPromises();
    expect(wrapper.get('[id="101"]').text()).not.toContain('/9');
    await wrapper.get('[id="101"]').trigger('click');
    expect(selection.currentSelection.feedId).toBe('101');
    expect(selection.currentSelection.categoryId).toBe('10');
  });

  it('keeps the inactive group expanded when Categories moves', async () => {
    mountSidebar();
    overview.categories[0].feeds[0].lastArticleReceivedAt = '2020-01-01T00:00:00Z';
    ui.setSidebarSettings({ ...ui.sidebarSettings, automaticallyHideInactiveFeeds: true });
    await flushPromises();
    const inactive = button('Inactive feeds');
    await inactive.trigger('click');
    expect(inactive.attributes('aria-expanded')).toBe('true');
    ui.setSidebarSettings({ ...ui.sidebarSettings, sectionOrder: custom });
    await flushPromises();
    expect(button('Inactive feeds').attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[id="101"]').text()).toContain('Example');
  });

  it('updates the rendered order only after the dialog save succeeds', async () => {
    mountSidebar();
    api.get.mockResolvedValue({ data: { settings: { ...ui.sidebarSettings } } });
    let complete;
    api.put.mockImplementation((_url, body) => new Promise(resolve => { complete = () => resolve({ data: body }); }));
    dialog = mount(SidebarConfigurationModal, { global: { plugins: [pinia], stubs: { BootstrapIcon: true } } });
    await flushPromises();
    const handle = dialog.get('[aria-label="Reorder Categories"]');
    for (let i = 0; i < 4; i++) await handle.trigger('keydown', { key: 'ArrowUp' });
    expect(titles()).toEqual(defaults);
    await dialog.get('form').trigger('submit');
    expect(titles()).toEqual(defaults);
    complete();
    await flushPromises();
    expect(titles()).toEqual(['Categories', 'Smart Folders', 'All feeds', 'Top tags in Unread']);
    expect(api.put).toHaveBeenCalledWith('/sidebar/settings', expect.objectContaining({
      settings: expect.objectContaining({ sectionOrder: ['categories', 'pinned', 'smart-folders', 'all-feeds', 'top-tags'] })
    }));
  });
});
