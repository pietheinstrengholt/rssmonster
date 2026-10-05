import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import * as articlesApi from '../src/api/articles.js';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import ArticleListView from '../src/components/articles/ArticleListView.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import { createArticleFeedPaginationState, articleFeedPaginationMethods } from '../src/components/articles/feed/pagination.js';
import { createArticleFeedVisibilityState, articleFeedVisibilityMethods } from '../src/components/articles/feed/visibilityTracking.js';
import { createFocusedStores } from './helpers/focusedStores.js';

// Mock only the browser boundary; deliver actual observer notifications to the pagination state machine.
let observers;
beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      this.takeRecords = vi.fn(() => []);
      observers.push(this);
    }
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const createContext = () => {
  const context = {
    ...createArticleFeedVisibilityState(), ...createArticleFeedPaginationState(),
    getLoadMoreSentinel: vi.fn(() => document.createElement('div')),
    getPaginationScrollRoot: vi.fn(() => null),
    getContent: vi.fn(), hasMore: true, hasLoadedContent: true
  };
  context.handleLoadMoreIntersections = entries => articleFeedPaginationMethods.handleLoadMoreIntersections.call(context, entries);
  context.observeLoadMoreSentinel = () => articleFeedVisibilityMethods.observeLoadMoreSentinel.call(context);
  const target = document.createElement('div');
  context.getLoadMoreSentinel.mockReturnValue(target);
  return context;
};
const notify = (context, observer, isIntersecting) => observer.callback([{
  target: context.getLoadMoreSentinel(), time: performance.now(), isIntersecting
}]);

describe('pagination observer', () => {
  it('keeps observation stable through appends and duplicate callbacks', () => {
    const context = createContext();
    const root = document.createElement('aside');
    context.getPaginationScrollRoot.mockReturnValue(root);
    context.observeLoadMoreSentinel();
    expect(observers[0].options).toEqual({ root, rootMargin: '0px 0px 800px 0px', threshold: 0 });
    notify(context, observers[0], true);
    context.articles = [{ id: 1 }];
    context.observeLoadMoreSentinel();
    notify(context, observers[0], true);
    expect(context.getContent).toHaveBeenCalledOnce();
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledOnce();
    expect(observers[0].disconnect).not.toHaveBeenCalled();
  });

  it('changes the root without granting another page or accepting stale observer callbacks', () => {
    const context = createContext();
    context.observeLoadMoreSentinel();
    notify(context, observers[0], true);
    context.getPaginationScrollRoot.mockReturnValue(document.createElement('aside'));
    context.observeLoadMoreSentinel();
    expect(observers).toHaveLength(2);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    notify(context, observers[0], false);
    notify(context, observers[1], true);
    expect(context.getContent).toHaveBeenCalledOnce();
    notify(context, observers[1], false);
    notify(context, observers[1], true);
    expect(context.getContent).toHaveBeenCalledTimes(2);
  });

  it('does not rearm from a recreated observer initially reporting outside the zone', () => {
    const context = createContext();
    context.observeLoadMoreSentinel();
    notify(context, observers[0], true);
    context.getLoadMoreSentinel.mockReturnValue(document.createElement('div'));
    context.observeLoadMoreSentinel();
    notify(context, observers[1], false);
    expect(context.loadMoreArmed).toBe(false);
    notify(context, observers[1], true);
    expect(context.getContent).toHaveBeenCalledOnce();
  });

  it('disconnects when the target disappears and keeps permission consumed on remount', () => {
    const context = createContext();
    context.observeLoadMoreSentinel();
    notify(context, observers[0], true);
    context.getLoadMoreSentinel.mockReturnValue(null);
    context.observeLoadMoreSentinel();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(context.loadMoreObserver).toBeNull();
    context.getLoadMoreSentinel.mockReturnValue(document.createElement('div'));
    context.observeLoadMoreSentinel();
    notify(context, observers[1], true);
    expect(context.getContent).toHaveBeenCalledOnce();
  });

  it('accepts a fast exit and re-entry in one batch without requesting multiple pages', () => {
    const context = createContext();
    context.observeLoadMoreSentinel();
    notify(context, observers[0], true);
    const time = performance.now();
    observers[0].callback([
      { target: context.getLoadMoreSentinel(), isIntersecting: false, time },
      { target: context.getLoadMoreSentinel(), isIntersecting: true, time: time + 1 },
      { target: context.getLoadMoreSentinel(), isIntersecting: false, time: time + 2 },
      { target: context.getLoadMoreSentinel(), isIntersecting: true, time: time + 3 }
    ]);
    expect(context.getContent).toHaveBeenCalledTimes(2);
  });

  it('uses the latest entry for the current target in a fast-scroll batch', () => {
    const context = createContext();
    context.observeLoadMoreSentinel();
    observers[0].callback([
      { target: context.getLoadMoreSentinel(), isIntersecting: true, time: 1 },
      { target: context.getLoadMoreSentinel(), isIntersecting: false, time: 2 },
      { target: document.createElement('div'), isIntersecting: true, time: 3 }
    ]);
    expect(context.getContent).not.toHaveBeenCalled();
    notify(context, observers[0], true);
    expect(context.getContent).toHaveBeenCalledOnce();
  });
});

describe('layout pagination roots', () => {
  it('connects the async Reader sentinel after mounting the real layout', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const article = { id: 1, title: 'Reader pagination article', status: 'unread', feed: { feedName: 'Example' } };
    vi.spyOn(articlesApi, 'fetchArticlePage').mockResolvedValue({ data: {
      paginationVersion: 1, totalCount: 2, sourceCount: 1,
      page: { itemIds: [1], articles: [article], hasMore: true, nextCursor: 'next' }
    } });
    vi.spyOn(articlesApi, 'fetchArticleRecommendations').mockResolvedValue({ data: { articles: [] } });
    const stores = createFocusedStores({ selection: { currentSelection: {
      viewMode: 'reader', sort: 'desc', status: 'unread', grouping: 'none'
    } } });
    const wrapper = mount(ArticleFeed, { global: { plugins: [stores.pinia] } });
    try {
      await vi.waitFor(() => {
        expect(wrapper.text()).toContain(article.title);
        const reader = wrapper.findComponent(ArticleReaderLayout);
        expect(wrapper.vm.loadMoreObserver?.options.root).toBe(reader.vm.getPaginationScrollRoot());
        expect(wrapper.vm.loadMoreObserver?.observe).toHaveBeenCalledWith(reader.vm.getLoadMoreSentinel());
      });
      const observer = wrapper.vm.loadMoreObserver;
      await wrapper.setData({ showSmartFoldersOverview: true });
      await vi.waitFor(() => {
        expect(observer.disconnect).toHaveBeenCalledOnce();
        expect(wrapper.vm.loadMoreObserver).toBeNull();
      });
    } finally {
      wrapper.unmount();
    }
  });

  it('uses Reader list scrolling independently of the detail panel', () => {
    const root = document.createElement('aside');
    expect(ArticleReaderLayout.methods.getPaginationScrollRoot.call({
      $refs: { articleListScrollRef: root, readerArticlePanelRef: document.createElement('section') }
    })).toBe(root);
  });

  it('uses Expanded, shell or browser scrolling according to effective CSS overflow', () => {
    const expanded = document.createElement('div');
    const shell = document.createElement('div');
    document.body.append(expanded, shell);
    const context = { viewMode: 'full', $refs: { expandedArticleScrollRef: expanded }, scrollRoot: shell };
    expanded.style.overflowY = 'auto';
    shell.style.overflowY = 'auto';
    expect(ArticleListView.methods.getPaginationScrollRoot.call(context)).toBe(expanded);
    context.viewMode = 'minimal';
    expect(ArticleListView.methods.getPaginationScrollRoot.call(context)).toBe(shell);
    context.viewMode = 'full';
    expanded.style.overflowY = 'visible';
    expect(ArticleListView.methods.getPaginationScrollRoot.call(context)).toBe(shell);
    shell.style.overflowY = 'visible';
    expect(ArticleListView.methods.getPaginationScrollRoot.call(context)).toBeNull();
    expanded.remove(); shell.remove();
  });

  it('delegates root ownership to the active layout', () => {
    const root = document.createElement('aside');
    expect(ArticleFeed.methods.getPaginationScrollRoot.call({
      $refs: { articleLayout: { getPaginationScrollRoot: () => root } }
    })).toBe(root);
  });
});

describe.each([ArticleListView, ArticleReaderLayout])('manual pagination in $name', Layout => {
  it('allows one intentional load and disables it while loading or at the end', async () => {
    const stores = createFocusedStores({ overview: { categories: [], smartFolders: [] } });
    const progress = { hasLoadedContent: true, hasMore: true, isLoading: false, isCollectionEmpty: false };
    const wrapper = mount(Layout, {
      props: { articles: [], container: [], collectionSummary: { status: 'unread', totalCount: 1 }, collectionProgress: progress },
      global: { plugins: [stores.pinia] }
    });
    const button = () => wrapper.findAll('button').find(button => button.text() === 'Load more articles');
    await button().trigger('click');
    expect(wrapper.emitted('load-more')).toHaveLength(1);
    await wrapper.setProps({ collectionProgress: { ...progress, isLoading: true } });
    expect(button().element.disabled).toBe(true);
    await button().trigger('click');
    expect(wrapper.emitted('load-more')).toHaveLength(1);
    await wrapper.setProps({ collectionProgress: { ...progress, hasMore: false } });
    expect(button()).toBeUndefined();
    wrapper.unmount();
  });
});
