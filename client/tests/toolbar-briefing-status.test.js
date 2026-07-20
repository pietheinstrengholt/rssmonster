import { describe, expect, it, vi } from 'vitest';
import { mount, shallowMount } from '@vue/test-utils';

import DesktopToolbar from '../src/components/DesktopToolbar.vue';
import MobileToolbar from '../src/components/MobileToolbar.vue';

// This function creates the toolbar store surface used by both components.
function createStore(AIEnabled) {
  return {
    data: {
      currentSelection: {
        AIEnabled,
        status: 'unread',
        viewMode: 'full',
        sort: 'desc',
        grouping: 'none',
        smartFolderId: null,
        categoryId: '%'
      },
      getSelectedStatus: 'unread',
      briefingCount: 8,
      unreadCount: 12,
      favoriteCount: 3,
      hotCount: 2,
      clickedCount: 4,
      readCount: 20,
      smartFolders: [],
      categories: [],
      searchQuery: '',
      chatAssistantOpen: false,
      themeMode: 'system',
      setSelectedStatus: vi.fn(),
      setSelectedSort: vi.fn(),
      setViewMode: vi.fn(),
      setGrouping: vi.fn(),
      setThemeMode: vi.fn(),
      setMobileSearchOpen: vi.fn(),
      setSelectedSearch: vi.fn()
    }
  };
}

// This function finds the status dropdown rendered by the desktop toolbar.
function desktopStatusDropdown(wrapper) {
  return wrapper.findAll('.toolbar-filter').find(filter => filter.get('.toolbar-filter-label').text() === 'Status:');
}

// This function finds the sort dropdown rendered by the desktop toolbar.
function desktopSortDropdown(wrapper) {
  return wrapper.findAll('.toolbar-filter').find(filter => filter.get('.toolbar-filter-label').text() === 'Sort:');
}

describe('toolbar Daily Briefing status', () => {
  it.each([DesktopToolbar, MobileToolbar])('hides Briefing in %s when AI mode is disabled', (component) => {
    const store = createStore(false);
    const wrapper = component === DesktopToolbar
      ? shallowMount(component, { global: { mocks: { $store: store } } })
      : mount(component, { global: { mocks: { $store: store } } });

    expect(wrapper.text()).not.toContain('Daily briefing');
  });

  it('shows and selects Daily Briefing in the desktop status dropdown', async () => {
    const store = createStore(true);
    const wrapper = shallowMount(DesktopToolbar, {
      global: { mocks: { $store: store } }
    });
    const statusDropdown = desktopStatusDropdown(wrapper);
    const briefingOption = statusDropdown.findAll('.dropdown-item')
      .find(option => option.text() === 'Daily briefing');

    expect(briefingOption).toBeDefined();
    await briefingOption.trigger('click');

    expect(store.data.setSelectedStatus).toHaveBeenCalledWith('briefing');
  });

  it('shows the Daily Briefing count and selects it from the mobile status dropdown', async () => {
    const store = createStore(true);
    const wrapper = mount(MobileToolbar, {
      global: { mocks: { $store: store } }
    });
    const briefingOption = wrapper.findAll('#readModeDropdown + .dropdown-menu .dropdown-item')
      .find(option => option.text() === 'Daily briefing 8');

    expect(briefingOption).toBeDefined();
    await briefingOption.trigger('click');

    expect(store.data.setSelectedStatus).toHaveBeenCalledWith('briefing');
  });
});

describe('toolbar Trust sort option', () => {
  it.each([DesktopToolbar, MobileToolbar])('shows and selects Trust in %s', async (component) => {
    const store = createStore(false);
    const wrapper = component === DesktopToolbar
      ? shallowMount(component, { global: { mocks: { $store: store } } })
      : mount(component, { global: { mocks: { $store: store } } });
    const options = component === DesktopToolbar
      ? desktopSortDropdown(wrapper).findAll('.dropdown-item')
      : wrapper.findAll('#readModeDropdown + .dropdown-menu .dropdown-item');
    const trustOption = options.find(option => option.text() === 'Trust');

    expect(trustOption).toBeDefined();
    await trustOption.trigger('click');

    expect(store.data.setSelectedSort).toHaveBeenCalledWith('trust');
  });
});
