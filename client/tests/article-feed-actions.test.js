import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import {
  markAsFavorite,
  markManyAsFavorite,
  markManyClicked
} from '../src/api/articles';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles', () => ({
  fetchArticleIds: vi.fn(),
  fetchArticleDetails: vi.fn(),
  markAllAsRead: vi.fn(),
  markArticlesAsRead: vi.fn(),
  markArticleUnread: vi.fn(),
  markArticleSeen: vi.fn(),
  markAsFavorite: vi.fn(),
  markManyAsFavorite: vi.fn(),
  markManyClicked: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

// Creates an ArticleFeed method context with observable store actions and events.
const createContext = (overrides = {}) => {
  const stores = createFocusedStores({
    overview: {
      currentSelection: { viewMode: 'reader' },
      smartFolders: [],
      applyFavoriteDelta: vi.fn(),
      fetchSmartFolders: vi.fn().mockResolvedValue()
    },
    selection: {
      currentSelection: { viewMode: 'reader' },
      resetArticleFilters: vi.fn(),
      setSmartFolder: vi.fn()
    },
    ui: {
      setSearchQuery: vi.fn()
    }
  });
  return {
    ...stores,
    articles: [
      { id: 1, favoriteInd: 0, clickedAmount: 0 },
      { id: 2, favoriteInd: 1, clickedAmount: 1 }
    ],
    pendingFavoriteArticleIds: new Set(),
    showSmartFoldersOverview: false,
    $emit: vi.fn(),
    ...ArticleFeed.methods,
    ...overrides
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ArticleFeed actions', () => {
  // Verifies global shortcuts emit reload and search-focus actions.
  it('handles global shortcuts while ignoring editable or modified events', () => {
    const context = createContext();
    const reloadEvent = {
      key: 'R',
      target: document.body,
      preventDefault: vi.fn()
    };
    const focusListener = vi.fn();
    window.addEventListener('rssmonster:focus-search', focusListener);

    context.handleGlobalShortcut(reloadEvent);
    context.handleGlobalShortcut({
      key: '/',
      target: document.body,
      preventDefault: vi.fn()
    });
    context.handleGlobalShortcut({
      key: 'R',
      ctrlKey: true,
      target: document.body,
      preventDefault: vi.fn()
    });
    context.handleGlobalShortcut({
      key: 'R',
      target: document.createElement('input'),
      preventDefault: vi.fn()
    });

    expect(reloadEvent.preventDefault).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledWith('forceReload');
    expect(focusListener).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledTimes(1);
    window.removeEventListener('rssmonster:focus-search', focusListener);
  });

  // Verifies single-article favorite changes reconcile local and overview state.
  it('toggles a favorite and ignores missing articles', async () => {
    const context = createContext();
    markAsFavorite.mockResolvedValue({
      data: { id: 1, feedId: 10, feed: { categoryId: 20 }, favoriteInd: 1 }
    });

    await context.toggleShortcutArticleFavorite({ id: 1 });
    await context.toggleShortcutArticleFavorite({ id: 99 });

    expect(markAsFavorite).toHaveBeenCalledWith(1, 'mark');
    expect(context.overviewStore.applyFavoriteDelta).toHaveBeenCalledWith({
      categoryId: 20,
      feedId: 10,
      delta: 1
    });
    expect(context.articles[0].favoriteInd).toBe(1);
    expect(markAsFavorite).toHaveBeenCalledOnce();
  });

  // Verifies repeated keyboard shortcuts cannot submit duplicate favorite mutations.
  it('guards duplicate keyboard favorite requests while persistence is pending', async () => {
    let resolveFavorite;
    const pendingFavorite = new Promise(resolve => {
      resolveFavorite = resolve;
    });
    const context = createContext();
    markAsFavorite.mockReturnValue(pendingFavorite);

    const firstMutation = context.toggleShortcutArticleFavorite({ id: 1 });
    const secondMutation = context.toggleShortcutArticleFavorite({ id: 1 });

    expect(markAsFavorite).toHaveBeenCalledOnce();
    expect(context.pendingFavoriteArticleIds).toContain('1');

    resolveFavorite({
      data: {
        id: 1,
        feedId: 10,
        feed: { categoryId: 20 },
        favoriteInd: 1
      }
    });
    await Promise.all([firstMutation, secondMutation]);

    expect(context.overviewStore.applyFavoriteDelta).toHaveBeenCalledOnce();
    expect(context.pendingFavoriteArticleIds.size).toBe(0);
  });

  // Verifies favorite failures preserve state and produce an actionable notification.
  it('reports favorite failures without mutating the article', async () => {
    const context = createContext();
    const error = new Error('offline');
    markAsFavorite.mockRejectedValue(error);

    await context.toggleShortcutArticleFavorite({ id: 1 });

    expect(context.articles[0].favoriteInd).toBe(0);
    expect(context.overviewStore.applyFavoriteDelta).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not update the favorite. Please try again.',
      error
    );
  });

  // Verifies reader bulk favorite and click actions only send meaningful work.
  it('favorites only eligible articles and applies click responses', async () => {
    const context = createContext();
    markManyAsFavorite.mockResolvedValue({
      data: {
        articles: [{ id: 1, feedId: 10, feed: { categoryId: 20 }, favoriteInd: 1 }]
      }
    });
    markManyClicked.mockResolvedValue({
      data: {
        articles: [
          { id: 1, clickedAmount: 2 },
          { id: 2, clickedAmount: 3 }
        ]
      }
    });

    await context.favoriteReaderArticles(context.articles);
    await context.markReaderArticlesClicked(context.articles);
    await context.favoriteReaderArticles([{ id: 2, favoriteInd: 1 }]);
    await context.markReaderArticlesClicked([]);

    expect(markManyAsFavorite).toHaveBeenCalledWith([1], 'mark');
    expect(markManyAsFavorite).toHaveBeenCalledOnce();
    expect(markManyClicked).toHaveBeenCalledWith([1, 2]);
    expect(markManyClicked).toHaveBeenCalledOnce();
    expect(context.articles.map(article => article.clickedAmount)).toEqual([2, 3]);
  });

  // Verifies bulk actions route by action and remain reader-only.
  it('routes reader bulk actions and guards other view modes', async () => {
    const context = createContext({
      favoriteReaderArticles: vi.fn().mockResolvedValue(),
      markReaderArticlesClicked: vi.fn().mockResolvedValue(),
      getReaderBulkReadArticles: vi.fn().mockReturnValue([{ id: 2 }]),
      markReaderArticlesRead: vi.fn().mockResolvedValue()
    });

    await ArticleFeed.methods.handleReaderBulkAction.call(context, {
      action: 'favorite-visible',
      selectedArticleId: 1
    });
    await ArticleFeed.methods.handleReaderBulkAction.call(context, {
      action: 'mark-visible-clicked',
      selectedArticleId: 1
    });
    await ArticleFeed.methods.handleReaderBulkAction.call(context, {
      action: 'mark-below-read',
      selectedArticleId: 1
    });

    expect(context.favoriteReaderArticles).toHaveBeenCalledWith(context.articles);
    expect(context.markReaderArticlesClicked).toHaveBeenCalledWith(context.articles);
    expect(context.markReaderArticlesRead).toHaveBeenCalledWith([{ id: 2 }]);

    context.selectionStore.currentSelection.viewMode = 'full';
    await ArticleFeed.methods.handleReaderBulkAction.call(context, {
      action: 'favorite-visible',
      selectedArticleId: 1
    });
    expect(context.favoriteReaderArticles).toHaveBeenCalledOnce();
  });

  // Verifies bulk failures are contained and surfaced to the user.
  it('reports reader bulk action failures', async () => {
    const error = new Error('bulk failed');
    const context = createContext({
      favoriteReaderArticles: vi.fn().mockRejectedValue(error)
    });

    await ArticleFeed.methods.handleReaderBulkAction.call(context, {
      action: 'favorite-visible',
      selectedArticleId: 1
    });

    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not update the selected articles. Please try again.',
      error
    );
  });

  // Verifies filter clearing and Smart Folder navigation use store contracts.
  it('clears filters and navigates Smart Folders through store actions', async () => {
    const context = createContext();
    const folder = { id: 5, query: 'unread:true' };

    context.clearFilters();
    await context.openSmartFolders();
    context.selectSmartFolderFromOverview(folder);

    expect(context.uiStore.setSearchQuery).toHaveBeenCalledWith('');
    expect(context.selectionStore.resetArticleFilters).toHaveBeenCalledOnce();
    expect(context.overviewStore.fetchSmartFolders).toHaveBeenCalledOnce();
    expect(context.selectionStore.setSmartFolder).toHaveBeenCalledWith(folder);
    expect(context.showSmartFoldersOverview).toBe(false);
  });

  // Verifies local response helpers update only matching articles and emit refresh actions.
  it('updates matching article state and emits refresh events', () => {
    const context = createContext();

    context.updateFavoriteInd({ id: 99, favoriteInd: 1 });
    context.updateClickedInd({ id: 99, clickedAmount: 4 });
    context.removeArticle({ id: 1 });
    context.forceReload();
    context.refreshFeeds();

    expect(context.articles.map(article => article.id)).toEqual([2]);
    expect(context.$emit).toHaveBeenCalledWith('forceReload');
    expect(context.$emit).toHaveBeenCalledWith('refresh-feeds');
  });
});
