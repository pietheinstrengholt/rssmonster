import { describe, expect, it, vi } from 'vitest';
import { config, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import DesktopToolbar from '../src/components/shell/DesktopToolbar.vue';
import MobileToolbar from '../src/components/shell/MobileToolbar.vue';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';

// This function creates the toolbar store surface used by both components.
function createStore(AIEnabled) {
  const pinia = createPinia();
  setActivePinia(pinia);
  config.global.plugins = [pinia];
  const selectionStore = useSelectionStore(pinia);
  const overviewStore = useOverviewStore(pinia);
  const uiStore = useUiStore(pinia);

  selectionStore.$patch({
    currentSelection: {
      ...selectionStore.currentSelection,
      AIEnabled,
      status: 'unread',
      viewMode: 'full',
      sort: 'desc',
      grouping: 'none',
      smartFolderId: null,
      categoryId: '%'
    }
  });
  overviewStore.$patch({
    briefingCount: 8,
    unreadCount: 12,
    favoriteCount: 3,
    hotCount: 2,
    clickedCount: 4,
    readCount: 20,
    smartFolders: [],
    categories: []
  });
  uiStore.$patch({
    searchQuery: '',
    chatAssistantOpen: false,
    themeMode: 'system'
  });
  vi.spyOn(selectionStore, 'setSelectedStatus').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'setSelectedSort').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'setViewMode').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'setGrouping').mockImplementation(() => {});
  vi.spyOn(selectionStore, 'setSelectedSearch').mockImplementation(() => {});

  return { overviewStore, selectionStore, uiStore };
}

// This function finds the status dropdown rendered by the desktop toolbar.
function desktopStatusDropdown(wrapper) {
  return wrapper.findAll('.toolbar-filter').find(filter => filter.get('.toolbar-filter-label').text() === 'Show:');
}

// This function finds the sort dropdown rendered by the desktop toolbar.
function desktopSortDropdown(wrapper) {
  return wrapper.findAll('.toolbar-filter').find(filter => filter.get('.toolbar-filter-label').text() === 'Sort:');
}

// This function finds the grouping dropdown rendered by the desktop toolbar.
function desktopGroupingDropdown(wrapper) {
  return wrapper.findAll('.toolbar-filter')
    .find(filter => filter.get('.toolbar-filter-label').text() === 'Grouping:');
}

describe('toolbar Daily Briefing status', () => {
  it('opens and closes the lazy Settings workspace from the desktop toolbar', async () => {
    createStore(true);
    const wrapper = mount(DesktopToolbar, {
      global: {
        stubs: {
          Settings: {
            name: 'Settings',
            emits: ['close'],
            template: '<button class="settings-close-stub" @click="$emit(\'close\')">Close</button>'
          }
        }
      }
    });

    expect(wrapper.find('.settings-close-stub').exists()).toBe(false);

    await wrapper.get('.toolbar-settings-button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.settings-close-stub').exists()).toBe(true);

    await wrapper.get('.settings-close-stub').trigger('click');
    expect(wrapper.find('.settings-close-stub').exists()).toBe(false);
  });

  it.each([DesktopToolbar, MobileToolbar])('hides Briefing in %s when AI mode is disabled', (component) => {
    createStore(false);
    const wrapper = mount(component);

    expect(wrapper.text()).not.toContain('Daily briefing');
  });

  it('shows and selects Daily Briefing in the desktop status dropdown', async () => {
    const store = createStore(true);
    const wrapper = mount(DesktopToolbar);
    const statusDropdown = desktopStatusDropdown(wrapper);
    const briefingOption = statusDropdown.findAll('[role="menuitem"]')
      .find(option => option.text() === 'Daily briefing');

    expect(briefingOption).toBeDefined();
    await briefingOption.trigger('click');

    expect(store.selectionStore.setSelectedStatus).toHaveBeenCalledWith('briefing');
  });

  it('shows the Daily Briefing count and selects it from the mobile status dropdown', async () => {
    const store = createStore(true);
    const wrapper = mount(MobileToolbar);
    const briefingOption = wrapper.findAll('#readModeDropdown-menu [role="menuitem"]')
      .find(option => option.text() === 'Daily briefing 8');

    expect(briefingOption).toBeDefined();
    await briefingOption.trigger('click');

    expect(store.selectionStore.setSelectedStatus).toHaveBeenCalledWith('briefing');
  });

  // This test preserves the toolbar reload behavior for an ordinary current status.
  it.each([DesktopToolbar, MobileToolbar])('reloads the current status in %s', async (component) => {
    const store = createStore(true);
    const wrapper = mount(component);

    wrapper.vm.statusClicked('unread');

    expect(wrapper.emitted('forceReload')).toHaveLength(1);
    expect(store.selectionStore.setSelectedStatus).not.toHaveBeenCalled();
  });

  // This test preserves status navigation out of a smart-folder selection.
  it.each([DesktopToolbar, MobileToolbar])('leaves a smart folder through the current status in %s', async (component) => {
    const store = createStore(true);
    store.selectionStore.currentSelection.smartFolderId = 42;
    const wrapper = mount(component);

    wrapper.vm.statusClicked('unread');

    expect(store.selectionStore.setSelectedStatus).toHaveBeenCalledWith('unread');
    expect(wrapper.emitted('forceReload')).toBeUndefined();
  });

  it('keeps desktop sort and grouping visible but disabled for Briefing', async () => {
    const store = createStore(true);
    store.selectionStore.currentSelection.status = 'briefing';
    const wrapper = mount(DesktopToolbar);
    const sortButton = desktopSortDropdown(wrapper).get('.toolbar-filter-button');
    const groupingButton = desktopGroupingDropdown(wrapper).get('.toolbar-filter-button');

    expect(sortButton.element.disabled).toBe(true);
    expect(groupingButton.element.disabled).toBe(true);
    expect(sortButton.attributes('title')).toContain('Briefing settings');

    wrapper.vm.sortClicked('quality');
    wrapper.vm.setGrouping('topic');

    expect(store.selectionStore.setSelectedSort).not.toHaveBeenCalled();
    expect(store.selectionStore.setGrouping).not.toHaveBeenCalled();
  });

  it('keeps mobile sort and grouping options visible but disabled for Briefing', async () => {
    const store = createStore(true);
    store.selectionStore.currentSelection.status = 'briefing';
    const wrapper = mount(MobileToolbar);
    const sortOption = wrapper.findAll('#readModeDropdown-menu [role="menuitem"]')
      .find(option => option.text() === 'Quality');
    const groupingOption = wrapper.findAll('#readModeDropdown-menu [role="menuitem"]')
      .find(option => option.text() === 'Cluster per topic');

    expect(sortOption).toBeDefined();
    expect(groupingOption).toBeDefined();
    expect(sortOption.element.disabled).toBe(true);
    expect(groupingOption.element.disabled).toBe(true);

    wrapper.vm.sortClicked('quality');
    wrapper.vm.setGrouping('topic');

    expect(store.selectionStore.setSelectedSort).not.toHaveBeenCalled();
    expect(store.selectionStore.setGrouping).not.toHaveBeenCalled();
  });
});

describe('toolbar intelligent sort options', () => {
  it.each([DesktopToolbar, MobileToolbar])('shows Top Stories and Quality without retired options in %s', async (component) => {
    const store = createStore(true);
    const wrapper = mount(component);
    const options = component === DesktopToolbar
      ? desktopSortDropdown(wrapper).findAll('[role="menuitem"]')
      : wrapper.findAll('#readModeDropdown-menu [role="menuitem"]');
    const qualityOption = options.find(option => option.text() === 'Quality');
    const topStoriesOption = options.find(option => option.text() === 'Top Stories');

    expect(options.some(option => option.text() === 'Trust')).toBe(false);
    expect(options.some(option => option.text() === 'Most Engaged')).toBe(false);
    expect(qualityOption).toBeDefined();
    expect(topStoriesOption).toBeDefined();
    await topStoriesOption.trigger('click');

    expect(store.selectionStore.setSelectedSort).toHaveBeenCalledWith('topStories');
  });
});
