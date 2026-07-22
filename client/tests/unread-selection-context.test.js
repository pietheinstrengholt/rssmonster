import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';

import ArticleListView from '../src/components/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/ArticleReaderLayout.vue';
import UnreadSelectionContext from '../src/components/UnreadSelectionContext.vue';
import UnreadConfigurationModal from '../src/components/model/UnreadConfigurationModal.vue';
import {
  fetchSettings,
  saveIncludeDevelopingEvents,
  saveStartupViewMode
} from '../src/api/settings.js';

vi.mock('../src/api/settings.js', () => ({
  fetchSettings: vi.fn(),
  saveIncludeDevelopingEvents: vi.fn(),
  saveStartupViewMode: vi.fn()
}));

let wrapper;

// This function provides the global store surface used by unread components.
function createStore(setShowModal = vi.fn(), setCurrentSelection = vi.fn()) {
  return {
    data: {
      setShowModal,
      setCurrentSelection,
      mobileSearchOpen: false,
      unreadsSinceLastUpdate: 0,
      currentSelection: {
        status: 'unread',
        smartFolderId: null,
        tag: null,
        search: '',
        categoryId: '%',
        feedId: '%',
        viewMode: 'full'
      },
      smartFolders: [],
      categories: []
    }
  };
}

beforeEach(() => {
  fetchSettings.mockReset();
  fetchSettings.mockResolvedValue({
    data: {
      includeDevelopingEvents: true,
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
    wrapper = mount(UnreadSelectionContext, {
      props: {
        articleCount: 76,
        sourceCount: 22
      },
      global: {
        mocks: {
          $store: createStore(setShowModal)
        }
      }
    });

    expect(wrapper.get('.briefing-context-text').text()).toBe(
      'Based on 76 articles from 22 sources'
    );
    expect(wrapper.text()).not.toContain('events');
    expect(wrapper.text()).not.toContain('topics');
    expect(wrapper.text()).not.toContain('interest areas');

    const action = wrapper.get('.briefing-tune-action');
    expect(action.text()).toBe('Tune your unread selection');
    expect(action.get('i').classes()).toContain('bi-sliders2');

    await action.trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('UnreadConfiguration');
  });

  it('appears in the loaded standard unread list with scoped counts', () => {
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
        mocks: {
          $store: createStore()
        }
      }
    });

    const context = wrapper.getComponent(UnreadSelectionContext);
    expect(context.props()).toMatchObject({ articleCount: 76, sourceCount: 22 });
  });

  it('appears once in the loaded reader unread list', () => {
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
        mocks: {
          $store: createStore()
        }
      }
    });

    expect(wrapper.findAllComponents(UnreadSelectionContext)).toHaveLength(1);
  });
});

describe('UnreadConfigurationModal', () => {
  it('loads and renders the unread and startup preferences', async () => {
    const setShowModal = vi.fn();
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        mocks: {
          $store: createStore(setShowModal)
        }
      }
    });
    await flushPromises();

    expect(fetchSettings).toHaveBeenCalledTimes(1);
    expect(wrapper.get('#unread-preferences-title').text()).toBe('Tune your unread selection');
    expect(wrapper.findAll('.unread-preferences-option-title').map(node => node.text())).toEqual([
      'Developing events',
      'Use default view on startup'
    ]);
    expect(wrapper.findAll('.unread-preferences-option-description')[0].text()).toBe(
      'Include new coverage for events you have already seen.'
    );
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(2);
    expect(wrapper.get('[name="includeDevelopingEvents"]').element.checked).toBe(true);
    expect(wrapper.get('[name="useDefaultStartupView"]').element.checked).toBe(true);
  });

  it('saves the preference through the dedicated API call', async () => {
    const setShowModal = vi.fn();
    const setCurrentSelection = vi.fn();
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        mocks: {
          $store: createStore(setShowModal, setCurrentSelection)
        }
      }
    });
    await flushPromises();

    await wrapper.get('[name="includeDevelopingEvents"]').setValue(false);
    await wrapper.get('[name="useDefaultStartupView"]').setValue(false);
    await wrapper.get('.unread-preferences-form').trigger('submit');
    await flushPromises();

    expect(saveIncludeDevelopingEvents).toHaveBeenCalledWith(false);
    expect(saveStartupViewMode).toHaveBeenCalledWith('last-used');
    expect(setCurrentSelection).toHaveBeenCalledWith({ includeDevelopingEvents: false });
    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('closes from its close button', async () => {
    const setShowModal = vi.fn();
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        mocks: {
          $store: createStore(setShowModal)
        }
      }
    });

    await wrapper.get('.unread-preferences-close').trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('closes on Escape and removes the listener when unmounted', () => {
    const setShowModal = vi.fn();
    wrapper = mount(UnreadConfigurationModal, {
      global: {
        mocks: {
          $store: createStore(setShowModal)
        }
      }
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(setShowModal).toHaveBeenCalledWith('');

    wrapper.unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

    expect(setShowModal).toHaveBeenCalledTimes(1);
  });
});
