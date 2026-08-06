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
});

describe('toolbar Trust sort option', () => {
  it.each([DesktopToolbar, MobileToolbar])('shows and selects Trust in %s', async (component) => {
    const store = createStore(false);
    const wrapper = mount(component);
    const options = component === DesktopToolbar
      ? desktopSortDropdown(wrapper).findAll('[role="menuitem"]')
      : wrapper.findAll('#readModeDropdown-menu [role="menuitem"]');
    const trustOption = options.find(option => option.text() === 'Trust');

    expect(trustOption).toBeDefined();
    await trustOption.trigger('click');

    expect(store.selectionStore.setSelectedSort).toHaveBeenCalledWith('trust');
  });
});
