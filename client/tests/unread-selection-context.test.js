import { h } from 'vue';
import NewArticlesBanner from '../src/components/articles/NewArticlesBanner.vue';
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
  savePrioritizeHighTrust,
  saveStartupViewMode,
  saveOpenArticleLinksInNewTab
} from '../src/api/settings.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/settings.js', () => ({
  fetchSettings: vi.fn(),
  saveIncludeDevelopingEvents: vi.fn(),
  saveMarkAsReadOnScroll: vi.fn(),
  savePrioritizeHighTrust: vi.fn(),
  saveOpenArticleLinksInNewTab: vi.fn(),
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
  saveOpenArticleLinksInNewTab.mockReset();
  saveOpenArticleLinksInNewTab.mockResolvedValue({ data: { openArticleLinksInNewTab: true } });
  fetchSettings.mockReset();
  fetchSettings.mockResolvedValue({
    data: {
      includeDevelopingEvents: true,
      markAsReadOnScroll: true,
      prioritizeHighTrust: true,
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
  savePrioritizeHighTrust.mockReset();
  savePrioritizeHighTrust.mockResolvedValue({
    data: {
      prioritizeHighTrust: false
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('UnreadSelectionContext', () => {
  it.each([
    [ArticleListView, false, false],
    [ArticleReaderLayout, true, false],
    [ArticleReaderLayout, true, true]
  ])('renders one arrivals banner in the layout header (%s, reader=%s, empty=%s)', (component, readerMode, empty) => {
    const stores = createStore();
    wrapper = shallowMount(component, {
      props: {
        articles: empty ? [] : [{ id: 1, status: 'unread' }],
        container: empty ? [] : [1],
        collectionSummary: { status: 'unread', unreadCount: 1, sourceCount: 1 },
        collectionProgress: { hasLoadedContent: true, isCollectionEmpty: empty }
      },
      slots: { 'before-context': props => h(NewArticlesBanner, { count: 3, readerMode: props.readerMode }) },
      global: { plugins: [stores.pinia], stubs: { NewArticlesBanner: false } }
    });
    expect(wrapper.findAllComponents(NewArticlesBanner)).toHaveLength(1);
    expect(wrapper.getComponent(NewArticlesBanner).props('readerMode')).toBe(readerMode);
    expect(wrapper.get('[role="status"]').text()).toContain('3 new articles');
  });

  it('defaults to All and exposes the selected age through aria-pressed', async () => {
    const stores = createStore();
    wrapper = mount(UnreadSelectionContext, {
      props: { articleCount: 0, sourceCount: 0 },
      global: { plugins: [stores.pinia] }
    });
    const buttons = wrapper.get('[role="group"][aria-label="Article age"]').findAll('button');
    expect(stores.selectionStore.ageCutoff).toBe('all');
    expect(buttons.map(button => button.attributes('aria-pressed'))).toEqual(['false', 'false', 'false', 'true']);
    for (const [index, value] of ['24h', '3d', '7d', 'all'].entries()) {
      await buttons[index].trigger('click');
      expect(stores.selectionStore.ageCutoff).toBe(value);
      expect(buttons.filter(button => button.attributes('aria-pressed') === 'true')).toHaveLength(1);
      expect(buttons[index].attributes('aria-pressed')).toBe('true');
    }
  });

  it.each([[ArticleListView, 'age'], [ArticleReaderLayout, 'age'], [ArticleListView, 'calendar'], [ArticleReaderLayout, 'calendar']])('retains date controls for an empty filtered collection (%s, %s)', (component, filter) => {
    const stores = createStore();
    if (filter === 'age') stores.selectionStore.setAgeCutoff('24h');
    else stores.selectionStore.setDateRange('today');
    wrapper = shallowMount(component, {
      props: {
        articles: [], container: [],
        collectionSummary: { status: 'unread', unreadCount: 0, sourceCount: 0 },
        collectionProgress: { hasLoadedContent: true, isCollectionEmpty: true }
      },
      global: { plugins: [stores.pinia] }
    });
    expect(wrapper.findAllComponents(UnreadSelectionContext)).toHaveLength(1);
  });

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

    expect(wrapper.text()).toContain('Based on 76 articles from 22 sources');
    expect(wrapper.text()).not.toContain('events');
    expect(wrapper.text()).not.toContain('topics');
    expect(wrapper.text()).not.toContain('interest areas');
    expect(wrapper.classes()).not.toContain('unread-selection-context--reader');

    const action = wrapper.findAll('button').find(button => button.text() === 'Tune your unread selection');
    expect(action.text()).toBe('Tune your unread selection');
    expect(action.getComponent({ name: 'BootstrapIcon' }).props('icon')).toBe('sliders2');

    await action.trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('UnreadConfiguration');
  });

  it('keeps both date labels aligned with the top visible row through scrolling and pagination', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-22T12:00:00'));
    const observers = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.observe = vi.fn(); this.disconnect = vi.fn(); observers.push(this); }
    });
    const scrollRoot = document.createElement('div');
    scrollRoot.style.overflowY = 'auto';
    document.body.appendChild(scrollRoot);
    const rows = [1, 2, 3, 4].map(() => document.createElement('article'));
    const articles = [
      { id: 1, publishedAt: '2026-09-22T08:00:00' },
      { id: 2, publishedAt: '2026-09-21T09:00:00' },
      { id: 3, publishedAt: '2026-09-19T10:00:00' }
    ];
    const stores = createStore();
    stores.selectionStore.setAgeCutoff('7d');
    wrapper = mount(UnreadSelectionContext, {
      attachTo: scrollRoot,
      props: { articleCount: 462, sourceCount: 4, articles, getArticleElement: id => rows[id - 1] },
      global: { plugins: [stores.pinia] }
    });
    rows.forEach(row => scrollRoot.appendChild(row));
    await flushPromises();
    const observer = observers.at(-1);
    expect(observer.options.root).toBe(scrollRoot);
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-09-22');
    expect(wrapper.get('time').text()).toBe('Tuesday, 22 September 2026');

    const intersect = async entries => {
      observer.callback(entries.map(([id, isIntersecting]) => ({ target: rows[id - 1], isIntersecting })));
      await flushPromises();
    };
    // Callback order does not determine the topmost row, and a partly visible first row still owns the date.
    await intersect([[2, true], [1, true]]);
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-09-22');
    await intersect([[1, false]]);
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-09-21');
    expect(wrapper.get('time').text()).toBe('Monday, 21 September 2026');
    await intersect([[2, false], [3, true]]);
    expect(wrapper.text()).toContain('Saturday');
    expect(wrapper.get('time').text()).toBe('Saturday, 19 September 2026');
    await intersect([[1, true], [3, false]]);
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-09-22');
    expect(wrapper.text()).toContain('Based on 462 articles from 4 sources');

    await wrapper.setProps({ articles: [...articles, { id: 4, publishedAt: '2026-09-18T10:00:00' }] });
    await flushPromises();
    expect(observers.at(-1).observe).toHaveBeenCalledWith(rows[3]);
    expect(observer.disconnect).toHaveBeenCalled();
    await wrapper.setProps({ articles: [{ id: 4, publishedAt: '2026-09-18T10:00:00' }] });
    await flushPromises();
    expect(wrapper.get('time').text()).toBe('Friday, 18 September 2026');
    await intersect([[1, true]]);
    expect(wrapper.get('time').text()).toBe('Friday, 18 September 2026');
    const finalObserver = observers.at(-1);
    wrapper.unmount();
    wrapper = null;
    expect(finalObserver.disconnect).toHaveBeenCalled();
    scrollRoot.remove();
  });

  it('accounts only for the sticky toolbar while the context bar scrolls away', async () => {
    const observers = [];
    let resize;
    const disconnectResize = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback, options) { this.options = options; this.observe = vi.fn(); this.disconnect = vi.fn(); observers.push(this); }
    });
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resize = callback; }
      observe() {}
      unobserve() {}
      disconnect() { disconnectResize(); }
    });
    const scrollRoot = document.createElement('div');
    scrollRoot.style.overflowY = 'auto';
    const toolbar = document.createElement('div');
    toolbar.style.position = 'sticky';
    toolbar.style.top = '0px';
    toolbar.getBoundingClientRect = () => ({ height: 56 });
    scrollRoot.appendChild(toolbar);
    document.body.appendChild(scrollRoot);
    const stores = createStore();
    wrapper = mount(UnreadSelectionContext, {
      attachTo: scrollRoot,
      props: { articleCount: 1, sourceCount: 1 },
      global: { plugins: [stores.pinia] }
    });
    wrapper.element.getBoundingClientRect = () => ({ height: 60 });
    await flushPromises();
    expect(wrapper.element.style.top).toBe('');
    expect(observers.at(-1).options.rootMargin).toBe('-56px 0px 0px 0px');
    wrapper.element.getBoundingClientRect = () => ({ height: 100 });
    resize();
    await flushPromises();
    expect(observers.at(-1).options.rootMargin).toBe('-56px 0px 0px 0px');
    wrapper.unmount();
    wrapper = null;
    expect(disconnectResize).toHaveBeenCalledOnce();
    scrollRoot.remove();
  });

  it('keeps tuning and singular counts usable when a publication date is missing', async () => {
    const setShowModal = vi.fn();
    const stores = createStore(setShowModal);
    wrapper = mount(UnreadSelectionContext, {
      props: { articleCount: 1, sourceCount: 1, articles: [{ id: 1, publishedAt: 'invalid' }] },
      global: { plugins: [stores.pinia] }
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Based on 1 article from 1 source');
    expect(wrapper.find('time').exists()).toBe(false);
    await wrapper.findAll('button').find(button => button.text() === 'Tune your unread selection').trigger('click');
    expect(setShowModal).toHaveBeenCalledWith('UnreadConfiguration');
  });

  it('appears in the loaded standard unread list with scoped counts', () => {
    const stores = createStore();
    wrapper = shallowMount(ArticleListView, {
      props: {
        articles: [{ id: 1 }],
        container: [1],
        collectionSummary: {
          status: 'unread', selectedTag: '', unreadCount: 76, totalCount: 42, sourceCount: 22
        },
        collectionProgress: {
          hasLoadedContent: true,
          isFlushed: false,
          hasReachedEnd: false,
          showFeedRefreshProgress: true
        },
        viewMode: 'full',
      },
      global: {
        plugins: [stores.pinia]
      }
    });

    const context = wrapper.getComponent(UnreadSelectionContext);
    expect(context.props()).toMatchObject({ articleCount: 42, sourceCount: 22 });
    expect(context.props('readerMode')).toBe(false);
  });

  it('appears once in the loaded reader unread list', () => {
    const stores = createStore();
    wrapper = shallowMount(ArticleReaderLayout, {
      props: {
        articles: [{ id: 1, status: 'unread' }],
        container: [1],
        collectionSummary: {
          status: 'unread', selectedTag: '', unreadCount: 76, sourceCount: 22
        },
        collectionProgress: {
          hasLoadedContent: true,
          isFlushed: false,
          hasReachedEnd: false,
          showFeedRefreshProgress: true
        }
      },
      global: {
        plugins: [stores.pinia]
      }
    });

    expect(wrapper.findAllComponents(UnreadSelectionContext)).toHaveLength(1);
    expect(wrapper.getComponent(UnreadSelectionContext).props('readerMode')).toBe(true);
  });

  it.each([
    ['standard', ArticleListView, { viewMode: 'full' }],
    ['reader', ArticleReaderLayout, {}]
  ])('is hidden in the loaded %s unread list when no posts are found', (_mode, component, extraProps) => {
    const stores = createStore();
    wrapper = shallowMount(component, {
      props: {
        articles: [],
        container: [],
        collectionSummary: {
          status: 'unread', selectedTag: '', unreadCount: 0, sourceCount: 0
        },
        collectionProgress: {
          hasLoadedContent: true,
          isFlushed: false,
          hasReachedEnd: false,
          showFeedRefreshProgress: true
        },
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
      'Prioritize high-trust coverage',
      'Mark as read while scrolling',
      'Use default view on startup',
      'Open article links in a new tab'
    ]);
    expect(wrapper.findAll('.unread-preferences-option-description')[0].text()).toBe(
      'Include new coverage for events you have already seen.'
    );
    expect(wrapper.findAll('.unread-preferences-option-description')[2].text()).toContain(
      'This also applies to Headlines mode.'
    );
    expect(wrapper.findAll('[role="switch"]')).toHaveLength(5);
    expect(wrapper.get('[name="includeDevelopingEvents"]').element.checked).toBe(true);
    expect(wrapper.get('[name="prioritizeHighTrust"]').element.checked).toBe(true);
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
    await wrapper.get('[name="prioritizeHighTrust"]').setValue(false);
    await wrapper.get('[name="markAsReadOnScroll"]').setValue(false);
    await wrapper.get('[name="useDefaultStartupView"]').setValue(false);
    await wrapper.get('[name="openArticleLinksInNewTab"]').setValue(true);
    await wrapper.get('.unread-preferences-form').trigger('submit');
    await flushPromises();

    expect(saveIncludeDevelopingEvents).toHaveBeenCalledWith(false);
    expect(savePrioritizeHighTrust).toHaveBeenCalledWith(false);
    expect(saveMarkAsReadOnScroll).toHaveBeenCalledWith(false);
    expect(saveStartupViewMode).toHaveBeenCalledWith('last-used');
    expect(saveOpenArticleLinksInNewTab).toHaveBeenCalledWith(true);
    expect(stores.uiStore.openArticleLinksInNewTab).toBe(true);
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
