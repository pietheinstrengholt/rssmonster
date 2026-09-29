import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import AppShell from '../src/AppShell.vue';
import { createArticleFeedReadState } from '../src/components/articles/feed/readState.js';
import { markAllAsRead, markArticlesAsRead } from '../src/api/articles';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles', async importOriginal => ({
  ...await importOriginal(),
  markAllAsRead: vi.fn(),
  markArticlesAsRead: vi.fn()
}));

let wrapper;
let surface;
const rect = (top, bottom, left = 0, right = 400) => ({ top, bottom, left, right, height: bottom - top, width: right - left });
const element = (parent, bounds) => {
  const node = document.createElement('article');
  node.getBoundingClientRect = () => bounds;
  parent.append(node);
  return node;
};

function setup(viewMode = 'full') {
  const stores = createFocusedStores({
    selection: { currentSelection: { viewMode, grouping: 'event', status: 'unread' } },
    overview: {
      fetchTopTags: vi.fn().mockResolvedValue(),
      fetchSmartFolders: vi.fn().mockResolvedValue(),
      fetchSmartFolderCounts: vi.fn().mockResolvedValue(),
      fetchOverviewSplit: vi.fn().mockResolvedValue()
    }
  });
  surface = document.createElement('section');
  surface.style.overflowY = 'auto';
  surface.getBoundingClientRect = () => rect(80, 500);
  document.body.append(surface);
  const cards = {
    1: element(surface, rect(100, 200)),
    2: element(surface, rect(550, 650)),
    3: element(surface, rect(900, 1000)),
    4: element(surface, rect(499, 650)),
    5: element(surface, rect(200, 250)),
    6: element(surface, rect(250, 300)),
    7: element(surface, rect(-200, -100)),
    8: element(surface, rect(100, 200, -500, -300))
  };
  const detail = element(surface, rect(100, 300));
  const context = {
    ...stores,
    ...createArticleFeedReadState(),
    ...ArticleFeed.methods,
    isLoading: false,
    articles: Object.keys(cards).map(id => ({ id: Number(id), status: id === '6' ? 'read' : 'unread', readerRecommendationInd: id === '5' })),
    $refs: { articleLayout: {
      getArticleElement: id => viewMode === 'reader' ? (id === 7 ? detail : null) : cards[id],
      getArticleListElement: id => viewMode === 'reader' ? cards[id] : null
    } }
  };
  wrapper = mount(Sidebar, {
    props: {
      markVisibleArticlesRead: () => AppShell.methods.markVisibleArticlesRead.call({ $refs: { articleFeed: context } })
    },
    global: { plugins: [stores.pinia], stubs: { BootstrapIcon: true } }
  });
  return { ...stores, context, cards };
}
const button = label => wrapper.findAll('button').find(item => item.text() === label);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('innerWidth', 1000);
  markAllAsRead.mockResolvedValue({ data: {} });
  markArticlesAsRead.mockImplementation(async ids => ({ data: { articles: ids.map(id => ({ id, status: 'read' })) } }));
});
afterEach(() => {
  wrapper?.unmount();
  surface?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Sidebar mark-as-read scope', () => {
  it('defaults to the full matching selection, including unloaded articles', async () => {
    const { selectionStore } = setup();
    await button('Mark selection read').trigger('click');
    await flushPromises();
    expect(markAllAsRead).toHaveBeenCalledWith(selectionStore.currentSelection);
    expect(markArticlesAsRead).not.toHaveBeenCalled();
    expect(wrapper.emitted('forceReload')).toHaveLength(1);
  });

  it.each(['full', 'minimal', 'reader'])('marks only on-screen articles in %s, respecting nested clipping', async viewMode => {
    const { uiStore, context } = setup(viewMode);
    uiStore.sidebarSettings.markReadVisibleOnly = true;
    await flushPromises();
    await button('Mark all visible as read').trigger('click');
    await flushPromises();
    const ids = viewMode === 'reader' ? [1, 4, 7] : [1, 4];
    expect(markArticlesAsRead).toHaveBeenCalledWith(ids);
    expect(markAllAsRead).not.toHaveBeenCalled();
    expect(context.articles.filter(article => article.status === 'read').map(article => article.id))
      .toEqual(viewMode === 'reader' ? [1, 4, 6, 7] : [1, 4, 6]);
    expect(wrapper.emitted('forceReload')).toBeUndefined();
  });

  it('does not broaden an empty visible set or a loading collection', async () => {
    const { uiStore, context } = setup();
    uiStore.sidebarSettings.markReadVisibleOnly = true;
    surface.style.display = 'none';
    await flushPromises();
    await button('Mark all visible as read').trigger('click');
    await flushPromises();
    surface.style.display = '';
    context.isLoading = true;
    await button('Mark all visible as read').trigger('click');
    await flushPromises();
    expect(markArticlesAsRead).not.toHaveBeenCalled();
    expect(markAllAsRead).not.toHaveBeenCalled();
  });

  it('blocks repeat clicks, preserves unread state on failure, and allows retry', async () => {
    const { uiStore, context } = setup();
    uiStore.sidebarSettings.markReadVisibleOnly = true;
    let reject;
    markArticlesAsRead.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notices = [];
    const onError = event => notices.push(event.detail.message);
    window.addEventListener(ACTION_ERROR_EVENT, onError);
    try {
      await flushPromises();
      const action = button('Mark all visible as read');
      await action.trigger('click');
      expect(action.element.disabled).toBe(true);
      await action.trigger('click');
      expect(markArticlesAsRead).toHaveBeenCalledTimes(1);
      reject(new Error('offline'));
      await flushPromises();
      expect(context.articles[0].status).toBe('unread');
      expect(notices).toEqual(['Could not mark these articles as read. Please try again.']);
      expect(action.element.disabled).toBe(false);
      await action.trigger('click');
      await flushPromises();
      expect(context.articles[0].status).toBe('read');
    } finally {
      window.removeEventListener(ACTION_ERROR_EVENT, onError);
    }
  });
});
