import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';

import ArticleListView from '../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import UnreadSelectionContext from '../src/components/articles/UnreadSelectionContext.vue';
import UnreadConfigurationModal from '../src/components/dialogs/UnreadConfigurationModal.vue';
import {
  fetchSettings,
  saveIncludeDevelopingEvents,
  saveMarkAsReadOnScroll,
  saveStartupViewMode
} from '../src/api/settings.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/settings.js', () => ({
  fetchSettings: vi.fn(),
  saveIncludeDevelopingEvents: vi.fn(),
  saveMarkAsReadOnScroll: vi.fn(),
  saveStartupViewMode: vi.fn()
}));

let wrapper;

// This function creates focused stores used by unread components.
function createStore(setShowModal = vi.fn(), setCurrentSelection = vi.fn()) {
  return createFocusedStores({
    overview: {
      categories: [],
      smartFolders: [],
      unreadsSinceLastUpdate: 0
    },
    selection: {
      setCurrentSelection,
      currentSelection: {
        status: 'unread',
        smartFolderId: null,
        tag: null,
        search: '',
        categoryId: '%',
        feedId: '%',
        viewMode: 'full'
      }
    },
    ui: {
      mobileSearchOpen: false,
      setShowModal
    }
  });
}

beforeEach(() => {
  fetchSettings.mockReset();
  fetchSettings.mockResolvedValue({
    data: {
      includeDevelopingEvents: true,
      markAsReadOnScroll: true,
      startupViewMode: 'default',
      minAdvertisementScore: 10,
      minSentimentScore: 20,
      minQualityScore: 30
    }
  });
  saveIncludeDevelopingEvents.mockReset();
  saveIncludeDevelopingEvents.mockResolvedValue({
    data: {
      includeDevelopingEvents: false
    }
  });
  saveMarkAsReadOnScroll.mockReset();
  saveMarkAsReadOnScroll.mockResolvedValue({
    data: {
      markAsReadOnScroll: false
    }
  });
  saveStartupViewMode.mockReset();
  saveStartupViewMode.mockResolvedValue({
    data: {
      startupViewMode: 'last-used'
    }
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('UnreadSelectionContext', () => {
  it('shows only article and source context and opens unread configuration', async () => {
    const setShowModal = vi.fn();
    const stores = createStore(setShowModal);
    wrapper = mount(UnreadSelectionContext, {
      props: {
        articleCount: 76,
        sourceCount: 22
      },
      global: {
        plugins: [stores.pinia]
      }
    });

    expect(wrapper.get('.briefing-context-text').text()).toBe(
      'Based on 76 articles from 22 sources'
    );
    expect(wrapper.text()).not.toContain('events');
    expect(wrapper.text()).not.toContain('topics');
    expect(wrapper.text()).not.toContain('interest areas');
    expect(wrapper.classes()).not.toContain('unread-selection-context--reader');

    const action = wrapper.get('.briefing-tune-action');
    expect(action.text()).toBe('Tune your unread selection');
    expect(action.getComponent({ name: 'BootstrapIcon' }).props('icon')).toBe('sliders2');

    await action.trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('UnreadConfiguration');
  });

  it('appears in the loaded standard unread list with scoped counts', () => {
    const stores = createStore();
    wrapper = shallowMount(ArticleListView, {
      props: {
        articles: [{ id: 1 }],
        pool: new Set(),
        container: [1],
        currentSelection: 'unread',
        currentViewUnreadCount: 76,
        currentViewSourceCount: 22,
        viewMode: 'full',
        remainingItems: 1,
        fetchCount: 20,
        hasLoadedContent: true,
        isFlushed: false,
        distance: 0
      },
      global: {
        plugins: [stores.pinia]
      }
    });

    const context = wrapper.getComponent(UnreadSelectionContext);
    expect(context.props()).toMatchObject({ articleCount: 76, sourceCount: 22 });
    expect(context.props('readerMode')).toBe(false);
  });

  it('appears once in the loaded reader unread list', () => {
    const stores = createStore();
    wrapper = shallowMount(ArticleReaderLayout, {
      props: {
        articles: [{ id: 1, status: 'unread' }],
        container: [1],
        currentSelection: 'unread',
        currentViewUnreadCount: 76,
        currentViewSourceCount: 22,
        remainingItems: 1,
        fetchCount: 20,
        hasLoadedContent: true,
        isFlushed: false,
        distance: 0
      },
      global: {
        plugins: [stores.pinia]
      }
    });

    expect(wrapper.findAllComponents(UnreadSelectionContext)).toHaveLength(1);
    expect(wrapper.getComponent(UnreadSelectionContext).props('readerMode')).toBe(true);
  });

  it.each([
    ['standard', ArticleListView, { pool: new Set(), viewMode: 'full' }],
    ['reader', ArticleReaderLayout, {}]
  ])('is hidden in the loaded %s unread list when no posts are found', (_mode, component, extraProps) => {
    const stores = createStore();
    wrapper = shallowMount(component, {
      props: {
        articles: [],
        container: [],
        currentSelection: 'unread',
        currentViewUnreadCount: 0,
        currentViewSourceCount: 0,
        remainingItems: 0,
        fetchCount: 20,
        hasLoadedContent: true,
        isFlushed: false,
        distance: 0,
        ...extraProps
      },
      global: {
        plugins: [stores.pinia]
      }
    });

    expect(wrapper.findComponent(UnreadSelectionContext).exists()).toBe(false);
  });
});

describe('UnreadConfigurationModal', () => {
  it('loads and renders the unread and startup preferences', async () => {
    const setShowModal = vi.fn();
    const stores = createStore(setShowModal);
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        plugins: [stores.pinia]
      }
    });
    await flushPromises();

    expect(fetchSettings).toHaveBeenCalledTimes(1);
    expect(wrapper.get('.preferences-dialog__title').text()).toContain(
      'Tune your unread selection'
    );
    expect(wrapper.findAll('.unread-preferences-option-title').map(node => node.text())).toEqual([
      'Developing events',
      'Mark as read while scrolling',
      'Use default view on startup'
    ]);
    expect(wrapper.findAll('.unread-preferences-option-description')[0].text()).toBe(
      'Include new coverage for events you have already seen.'
    );
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(3);
    expect(wrapper.get('[name="includeDevelopingEvents"]').element.checked).toBe(true);
    expect(wrapper.get('[name="markAsReadOnScroll"]').element.checked).toBe(true);
    expect(wrapper.get('[name="useDefaultStartupView"]').element.checked).toBe(true);
  });

  it('saves the preference through the dedicated API call', async () => {
    const setShowModal = vi.fn();
    const setCurrentSelection = vi.fn();
    const stores = createStore(setShowModal, setCurrentSelection);
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        plugins: [stores.pinia]
      }
    });
    await flushPromises();

    await wrapper.get('[name="includeDevelopingEvents"]').setValue(false);
    await wrapper.get('[name="markAsReadOnScroll"]').setValue(false);
    await wrapper.get('[name="useDefaultStartupView"]').setValue(false);
    await wrapper.get('.unread-preferences-form').trigger('submit');
    await flushPromises();

    expect(saveIncludeDevelopingEvents).toHaveBeenCalledWith(false);
    expect(saveMarkAsReadOnScroll).toHaveBeenCalledWith(false);
    expect(saveStartupViewMode).toHaveBeenCalledWith('last-used');
    expect(setCurrentSelection).toHaveBeenCalledWith({
      includeDevelopingEvents: false,
      markAsReadOnScroll: false
    });
    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('closes from its close button', async () => {
    const setShowModal = vi.fn();
    const stores = createStore(setShowModal);
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        plugins: [stores.pinia]
      }
    });

    await wrapper.get('.base-dialog__close').trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('closes on Escape and removes the listener when unmounted', () => {
    const setShowModal = vi.fn();
    const stores = createStore(setShowModal);
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        plugins: [stores.pinia]
      }
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(setShowModal).toHaveBeenCalledWith('');

    wrapper.unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

    expect(setShowModal).toHaveBeenCalledTimes(1);
  });
});
