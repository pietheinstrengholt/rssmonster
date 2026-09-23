import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import Sortable from 'sortablejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SidebarConfigurationModal from '../src/components/dialogs/SidebarConfigurationModal.vue';
import { useAuthStore } from '../src/store/auth.js';
import { useUiStore } from '../src/store/ui.js';
import { fetchSidebarSettings, saveSidebarSettings } from '../src/api/sidebar.js';

vi.mock('../src/api/sidebar.js', () => ({
  fetchSidebarSettings: vi.fn(),
  saveSidebarSettings: vi.fn()
}));

let wrapper;
const defaultSectionOrder = ['pinned', 'smart-folders', 'all-feeds', 'top-tags', 'categories'];
const sectionLabels = () => wrapper.get('[aria-label="Sidebar section order"]').findAll('li').map(row => row.text());
const defaults = { showTotalCount: true, declutterCounts: true, hideZeroCountItems: false, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false };
const mountDialog = (options = {}) => {
  const pinia = createPinia();
  const uiStore = useUiStore(pinia);
  uiStore.setShowModal('SidebarConfiguration');
  wrapper = mount(SidebarConfigurationModal, {
    ...options,
    global: { plugins: [pinia], stubs: { BootstrapIcon: true } }
  });
  return uiStore;
};
beforeEach(() => {
  vi.resetAllMocks();
  fetchSidebarSettings.mockResolvedValue({ data: { settings: defaults } });
  saveSidebarSettings.mockImplementation(async settings => {
    // Emulate an older server that returns only the existing preference fields.
    const saved = { ...settings };
    delete saved.sectionOrder;
    return { data: { settings: saved } };
  });
});
afterEach(() => wrapper?.unmount());

describe('Sidebar configuration dialog', () => {
  it('shows the five default sections and saves stable IDs', async () => {
    mountDialog();
    expect(wrapper.get('[aria-label="Reorder Smart Folders"]').element.disabled).toBe(true);
    await flushPromises();
    expect(sectionLabels()).toEqual(['Pinned', 'Smart Folders', 'All feeds', 'Top tags', 'Categories']);
    await wrapper.get('form').trigger('submit');
    expect(saveSidebarSettings).toHaveBeenCalledWith({ ...defaults, sectionOrder: defaultSectionOrder });
  });

  it('reorders through the drag library without saving until submit', async () => {
    mountDialog();
    await flushPromises();
    const list = wrapper.get('[aria-label="Sidebar section order"]').element;
    const sortable = Sortable.get(list);
    const item = list.children[0];
    // Simulate the DOM move and callbacks supplied by Sortable in a browser.
    const event = { item, from: list, oldIndex: 0, newIndex: 2 };
    sortable.option('onStart')(event);
    list.insertBefore(item, list.children[3]);
    sortable.option('onUpdate')(event);
    sortable.option('onEnd')(event);
    await flushPromises();
    expect(sectionLabels()).toEqual(['Smart Folders', 'All feeds', 'Pinned', 'Top tags', 'Categories']);
    expect(saveSidebarSettings).not.toHaveBeenCalled();
    await wrapper.get('form').trigger('submit');
    expect(saveSidebarSettings).toHaveBeenCalledWith({
      ...defaults, sectionOrder: ['smart-folders', 'all-feeds', 'pinned', 'top-tags', 'categories']
    });
  });

  it('loads an existing order, supports keyboard moves, and keeps the loaded array unchanged', async () => {
    const sectionOrder = ['categories', 'smart-folders', 'top-tags', 'pinned', 'all-feeds'];
    fetchSidebarSettings.mockResolvedValue({ data: { settings: { ...defaults, sectionOrder } } });
    mountDialog({ attachTo: document.body });
    await flushPromises();
    expect(sectionLabels()).toEqual(['Categories', 'Smart Folders', 'Top tags', 'Pinned', 'All feeds']);
    await wrapper.get('[aria-label="Reorder Categories"]').trigger('keydown', { key: 'ArrowUp' });
    await wrapper.get('[aria-label="Reorder All feeds"]').trigger('keydown', { key: 'ArrowDown' });
    expect(sectionLabels()).toEqual(['Categories', 'Smart Folders', 'Top tags', 'Pinned', 'All feeds']);
    await wrapper.get('[aria-label="Reorder Smart Folders"]').trigger('keydown', { key: 'ArrowUp' });
    expect(sectionLabels()).toEqual(['Smart Folders', 'Categories', 'Top tags', 'Pinned', 'All feeds']);
    expect(document.activeElement).toBe(wrapper.get('[aria-label="Reorder Smart Folders"]').element);
    expect(sectionOrder).toEqual(['categories', 'smart-folders', 'top-tags', 'pinned', 'all-feeds']);
    await wrapper.get('form').trigger('submit');
    expect(saveSidebarSettings).toHaveBeenCalledWith({
      ...defaults, sectionOrder: ['smart-folders', 'categories', 'top-tags', 'pinned', 'all-feeds']
    });
  });

  it('discards ordering changes on Cancel and restores the loaded order on reopening', async () => {
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('[aria-label="Reorder Categories"]').trigger('keydown', { key: 'ArrowUp' });
    expect(sectionLabels()).toEqual(['Pinned', 'Smart Folders', 'All feeds', 'Categories', 'Top tags']);
    await wrapper.findAll('button').find(button => button.text() === 'Cancel').trigger('click');
    expect(uiStore.showModal).toBe('');
    expect(saveSidebarSettings).not.toHaveBeenCalled();
    expect(uiStore.sidebarSettings).toEqual(defaults);
    wrapper.unmount();
    mountDialog();
    await flushPromises();
    expect(sectionLabels()).toEqual(['Pinned', 'Smart Folders', 'All feeds', 'Top tags', 'Categories']);
  });

  it('loads saved values and updates the sidebar only after saving', async () => {
    fetchSidebarSettings.mockResolvedValue({ data: { settings: { ...defaults, showTotalCount: false } } });
    const uiStore = mountDialog();
    expect(wrapper.get('[role="switch"]').element.disabled).toBe(true);
    await flushPromises();
    expect(wrapper.get('h2').text()).toBe('Sidebar configuration settings');
    const switches = wrapper.findAll('[role="switch"]');
    expect(switches).toHaveLength(6);
    expect(switches[0].element.checked).toBe(false);
    await switches[0].setValue(true);
    await switches[1].setValue(false);
    expect(switches[2].element.checked).toBe(false);
    await switches[2].setValue(true);
    expect(uiStore.sidebarSettings).toEqual({ showTotalCount: false, declutterCounts: true, hideZeroCountItems: false, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSidebarSettings).toHaveBeenCalledWith({ sectionOrder: defaultSectionOrder, showTotalCount: true, declutterCounts: false, hideZeroCountItems: true, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false });
    expect(uiStore.sidebarSettings).toEqual({ showTotalCount: true, declutterCounts: false, hideZeroCountItems: true, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false });
    expect(uiStore.showModal).toBe('');
  });

  it.each([30, 60, 90])('saves inactive grouping with a %i-day threshold', async days => {
    const uiStore = mountDialog();
    await flushPromises();
    const toggle = wrapper.get('[aria-labelledby="sidebar-hide-inactive-label"]');
    expect(toggle.element.checked).toBe(false);
    const select = wrapper.get('select');
    expect(select.element.disabled).toBe(true);
    expect(select.findAll('option').map(option => option.text())).toEqual(['30 days', '60 days', '90 days']);
    await toggle.setValue(true);
    expect(select.element.disabled).toBe(false);
    await select.setValue(String(days));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSidebarSettings).toHaveBeenCalledWith({ sectionOrder: defaultSectionOrder, ...defaults, automaticallyHideInactiveFeeds: true, inactiveFeedDays: days });
    expect(uiStore.sidebarSettings.inactiveFeedDays).toBe(days);
    expect(uiStore.sidebarSettings.automaticallyHideInactiveFeeds).toBe(true);
  });

  it.each(['manual', 'name', 'selectedCount', 'totalCount', 'recentlyActive'])('saves %s sorting', async sortOrder => {
    const uiStore = mountDialog();
    await flushPromises();
    const select = wrapper.get('select[aria-label="Sort sidebar category items by"]');
    expect(select.element.value).toBe('manual');
    expect(select.findAll('option').map(option => option.text())).toEqual([
      'Manual order', 'Name', 'Selected count', 'Total count', 'Recently active'
    ]);
    await select.setValue(sortOrder);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSidebarSettings).toHaveBeenCalledWith({ sectionOrder: defaultSectionOrder, ...defaults, sortOrder });
    expect(uiStore.sidebarSettings.sortOrder).toBe(sortOrder);
  });

  it('disables the other sort selector during dynamic sorting and restores its saved choice', async () => {
    fetchSidebarSettings.mockResolvedValue({ data: { settings: { ...defaults, sortOrder: 'name' } } });
    const uiStore = mountDialog();
    await flushPromises();
    const toggle = wrapper.get('[aria-labelledby="sidebar-dynamic-sort-label"]');
    const select = wrapper.get('select[aria-label="Sort sidebar category items by"]');
    expect(toggle.element.checked).toBe(false);
    expect(select.element.disabled).toBe(false);
    await toggle.setValue(true);
    expect(select.element.disabled).toBe(true);
    expect(select.element.value).toBe('name');
    expect(uiStore.sidebarSettings.sortByCurrentSelection).toBe(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSidebarSettings).toHaveBeenCalledWith({ sectionOrder: defaultSectionOrder, ...defaults, sortOrder: 'name', sortByCurrentSelection: true });
    expect(uiStore.sidebarSettings.sortByCurrentSelection).toBe(true);
    wrapper.unmount();
    fetchSidebarSettings.mockResolvedValue({ data: { settings: { ...defaults, sortOrder: 'name', sortByCurrentSelection: true } } });
    mountDialog();
    await flushPromises();
    const restored = wrapper.get('select[aria-label="Sort sidebar category items by"]');
    expect(restored.element.disabled).toBe(true);
    await wrapper.get('[aria-labelledby="sidebar-dynamic-sort-label"]').setValue(false);
    expect(restored.element.disabled).toBe(false);
    expect(restored.element.value).toBe('name');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSidebarSettings).toHaveBeenLastCalledWith({ sectionOrder: defaultSectionOrder, ...defaults, sortOrder: 'name' });
  });

  it('shows favicons by default and applies the choice only after saving', async () => {
    const uiStore = mountDialog();
    await flushPromises();
    const toggle = wrapper.get('[aria-labelledby="sidebar-feed-favicons-label"]');
    expect(toggle.element.checked).toBe(true);
    await toggle.setValue(false);
    expect(uiStore.sidebarSettings.showFeedFavicons).toBe(true);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(saveSidebarSettings).toHaveBeenCalledWith({ sectionOrder: defaultSectionOrder, ...defaults, showFeedFavicons: false });
    expect(uiStore.sidebarSettings.showFeedFavicons).toBe(false);
  });

  it('cancels without saving draft values', async () => {
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('[role="switch"]').setValue(false);
    await wrapper.get('button[aria-label="Close sidebar settings"]').trigger('click');
    expect(uiStore.showModal).toBe('');
    expect(uiStore.sidebarSettings).toEqual(defaults);
    expect(saveSidebarSettings).not.toHaveBeenCalled();
  });

  it('prevents saving when loading fails', async () => {
    fetchSidebarSettings.mockRejectedValue(new Error('offline'));
    mountDialog();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be loaded');
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true);
    await wrapper.get('form').trigger('submit');
    expect(saveSidebarSettings).not.toHaveBeenCalled();
  });

  it('keeps saved counts unchanged on failure and permits retry', async () => {
    saveSidebarSettings.mockRejectedValueOnce(new Error('offline'));
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('[role="switch"]').setValue(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be saved');
    expect(uiStore.sidebarSettings).toEqual(defaults);
    expect(uiStore.showModal).toBe('SidebarConfiguration');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(uiStore.sidebarSettings.showTotalCount).toBe(false);
    expect(uiStore.showModal).toBe('');
  });

  it('blocks duplicate saves and dismissal while saving', async () => {
    let resolve;
    saveSidebarSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    await wrapper.get('form').trigger('submit');
    expect(saveSidebarSettings).toHaveBeenCalledTimes(1);
    expect(wrapper.get('button[aria-label="Close sidebar settings"]').element.disabled).toBe(true);
    resolve({ data: { settings: defaults } });
    await flushPromises();
    expect(uiStore.showModal).toBe('');
  });

  it('ignores a save completing after logout', async () => {
    let resolve;
    saveSidebarSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const uiStore = mountDialog();
    await flushPromises();
    await wrapper.get('[role="switch"]').setValue(false);
    await wrapper.get('form').trigger('submit');
    useAuthStore().clearSession();
    resolve({ data: { settings: { showTotalCount: false, declutterCounts: false, hideZeroCountItems: true, automaticallyHideInactiveFeeds: true, inactiveFeedDays: 60, sortOrder: 'name', showFeedFavicons: false, sortByCurrentSelection: true } } });
    await flushPromises();
    expect(uiStore.sidebarSettings).toEqual(defaults);
  });

  it('ignores a late load after the dialog is closed', async () => {
    let resolve;
    fetchSidebarSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
    const uiStore = mountDialog();
    wrapper.unmount();
    resolve({ data: { settings: { showTotalCount: false, declutterCounts: false, hideZeroCountItems: true, automaticallyHideInactiveFeeds: true, inactiveFeedDays: 60, sortOrder: 'name', showFeedFavicons: false, sortByCurrentSelection: true } } });
    await flushPromises();
    expect(uiStore.sidebarSettings).toEqual(defaults);
  });
});
