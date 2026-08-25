import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Article from '../src/components/articles/Article.vue';
import {
  fetchDuplicateArticles,
  markAsFavorite,
  markClicked,
  markNotInterested
} from '../src/api/articles.js';
import { fetchEventArticles } from '../src/api/events.js';
import { fetchTopicArticles } from '../src/api/topics.js';
import { articleActionMethods } from '../src/components/articles/helpers/articleActions.js';
import {
  createArticleExpansionState,
  articleExpansionMethods
} from '../src/components/articles/helpers/articleExpansion.js';
import {
  articleSignalComputed,
  createArticleSignals,
  getEventSourceScore,
  hasHighQualityArticleSignal,
  hasTrustedSourceSignal
} from '../src/components/articles/helpers/articleSignals.js';
import {
  createArticleMobileSwipeState,
  articleMobileSwipeMethods
} from '../src/components/articles/helpers/mobileSwipe.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  fetchDuplicateArticles: vi.fn(),
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn(),
  updateClickedStatus: vi.fn()
}));

vi.mock('../src/api/events.js', () => ({
  fetchEventArticles: vi.fn()
}));

vi.mock('../src/api/feeds.js', () => ({
  muteFeed: vi.fn()
}));

vi.mock('../src/api/topics.js', () => ({
  fetchTopicArticles: vi.fn()
}));

// Creates swipe state with the component methods bound as Vue would expose them.
function createSwipeContext() {
  const context = {
    ...createArticleMobileSwipeState(),
    isMobilePortrait: true,
    markAsFavorite: vi.fn()
  };
  context.resetSwipe = clearSuppressClick =>
    articleMobileSwipeMethods.resetSwipe.call(context, clearSuppressClick);
  return context;
}

// Creates related-article expansion state for the requested grouping.
function createExpansionContext(grouping = 'event') {
  const stores = createFocusedStores({
    selection: {
      currentSelection: { grouping }
    }
  });
  return {
    ...stores,
    ...createArticleExpansionState(),
    id: 42,
    $emit: vi.fn()
  };
}

// Mounts an article with the minimal store and child-component surface.
function mountArticle(props = {}) {
  const stores = createFocusedStores({
    overview: {
      categories: []
    },
    selection: {
      currentSelection: {
        grouping: 'event',
        viewMode: 'full'
      }
    }
  });
  return shallowMount(Article, {
    props: {
      id: 42,
      title: 'Signal article',
      url: 'https://example.com/article',
      feed: { feedName: 'Example Feed' },
      ...props
    },
    global: {
      plugins: [stores.pinia],
      stubs: {
        ArticleActionsMenu: true,
        ArticleContent: true,
        ArticleHeader: true,
        ArticleMedia: true,
        ArticleMeta: true,
        ArticleTagsScores: true,
        BootstrapIcon: true
      }
    }
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Article mobile swipe behavior', () => {
  it('resets swipe state when the shared portrait query stops matching', () => {
    const context = createSwipeContext();
    context.resetSwipe = vi.fn();

    Article.watch.isMobilePortrait.call(context, true);
    expect(context.resetSwipe).not.toHaveBeenCalled();

    Article.watch.isMobilePortrait.call(context, false);
    expect(context.resetSwipe).toHaveBeenCalledOnce();
  });

  it('caps horizontal movement and favorites after crossing the threshold', () => {
    vi.useFakeTimers();
    const context = createSwipeContext();
    const preventDefault = vi.fn();

    articleMobileSwipeMethods.onSwipeTouchStart.call(context, {
      touches: [{ clientX: 10, clientY: 20 }]
    });
    articleMobileSwipeMethods.onSwipeTouchMove.call(context, {
      touches: [{ clientX: 210, clientY: 25 }],
      cancelable: true,
      preventDefault
    });

    expect(context.swipeTranslateX).toBe(128);
    expect(preventDefault).toHaveBeenCalledOnce();

    articleMobileSwipeMethods.onSwipeTouchEnd.call(context);

    expect(context.markAsFavorite).toHaveBeenCalledOnce();
    expect(context.swipeTranslateX).toBe(0);
    expect(context.swipeSuppressClick).toBe(true);

    vi.advanceTimersByTime(250);
    expect(context.swipeSuppressClick).toBe(false);
  });

  it('cancels an unlocked swipe when vertical movement wins', () => {
    const context = createSwipeContext();

    articleMobileSwipeMethods.onSwipeTouchStart.call(context, {
      touches: [{ clientX: 20, clientY: 20 }]
    });
    articleMobileSwipeMethods.onSwipeTouchMove.call(context, {
      touches: [{ clientX: 30, clientY: 80 }],
      cancelable: true,
      preventDefault: vi.fn()
    });

    expect(context.swipeTracking).toBe(false);
    expect(context.swipeTranslateX).toBe(0);
    expect(context.markAsFavorite).not.toHaveBeenCalled();
  });
});

describe('Article related-article expansion', () => {
  it('uses the topic endpoint and emits server-ordered related articles', async () => {
    fetchTopicArticles.mockResolvedValue({
      data: { articles: [{ id: 43 }, { id: 44 }] }
    });
    const context = createExpansionContext('topic');

    articleExpansionMethods.viewEventArticles.call(context, 9);
    await flushPromises();

    expect(fetchTopicArticles).toHaveBeenCalledWith(9, 42);
    expect(fetchEventArticles).not.toHaveBeenCalled();
    expect(context.$emit).toHaveBeenCalledWith('event-articles-loaded', {
      articleId: 42,
      eventId: 9,
      articles: [{ id: 43 }, { id: 44 }]
    });
    expect(context.eventExpanded).toBe(true);
  });

  it('collapses loaded duplicates without making another request', () => {
    const context = createExpansionContext();
    context.duplicatesExpanded = true;

    articleExpansionMethods.viewDuplicateArticles.call(context);

    expect(fetchDuplicateArticles).not.toHaveBeenCalled();
    expect(context.$emit).toHaveBeenCalledWith(
      'duplicate-articles-collapsed',
      { articleId: 42 }
    );
    expect(context.duplicatesExpanded).toBe(false);
  });
});

describe('Article relevance signals', () => {
  it('classifies explicit article inputs without a Vue component instance', () => {
    const article = {
      author: 'Reporter',
      event: { sourceCount: '5' },
      feed: { feedName: 'Trusted Feed', feedTrust: '0.9' },
      isOfficialSource: false,
      qualityScore: 91,
      recommendationScore: 0
    };

    expect(createArticleSignals(article)).toEqual([
      { label: 'High quality', icon: 'stars' },
      { label: 'Trending', icon: 'graph-up-arrow' },
      { label: 'Trusted source (Trusted Feed)', icon: 'shield-fill-check' }
    ]);
    expect(hasHighQualityArticleSignal(article)).toBe(true);
    expect(hasTrustedSourceSignal(article.feed)).toBe(true);
    expect(getEventSourceScore({ sourceCount: 'invalid' })).toBe(0);
  });

  it('prioritizes major events and official sources over lower-tier signals', () => {
    const wrapper = mountArticle({
      qualityScore: 0.95,
      recommendationScore: 0.92,
      isOfficialSource: true,
      officialOrganization: 'Public Agency',
      author: 'Reporter',
      feed: {
        feedName: 'Trusted Feed',
        feedTrust: 0.99
      },
      event: {
        articleCount: 8,
        sourceCount: 7
      }
    });

    expect(wrapper.vm.articleSignals).toEqual([
      { label: 'High quality', icon: 'stars' },
      { label: 'Major event', icon: 'broadcast' },
      { label: 'Official Feed (Public Agency)', icon: 'patch-check-fill' }
    ]);
  });
});

describe('Article API actions', () => {
  it('reconciles favorite counts and emits the existing update payload', async () => {
    markAsFavorite.mockResolvedValue({
      data: {
        feedId: 3,
        feed: { categoryId: 2 },
        favoriteInd: 1
      }
    });
    const applyFavoriteDelta = vi.fn();
    const context = {
      ...createFocusedStores({
        overview: { applyFavoriteDelta }
      }),
      id: 42,
      favoriteInd: 0,
      favoriteMutationPending: false,
      $emit: vi.fn()
    };

    articleActionMethods.markAsFavorite.call(context);
    await flushPromises();

    expect(markAsFavorite).toHaveBeenCalledWith(42, 'mark');
    expect(applyFavoriteDelta).toHaveBeenCalledWith({
      categoryId: 2,
      feedId: 3,
      delta: 1
    });
    expect(context.$emit).toHaveBeenCalledWith(
      'update-favorite',
      { id: 42, favoriteInd: 1 }
    );
  });

  it('guards duplicate favorite requests and applies one persisted transition', async () => {
    let resolveFavorite;
    const pendingFavorite = new Promise(resolve => {
      resolveFavorite = resolve;
    });
    markAsFavorite.mockReturnValue(pendingFavorite);
    const applyFavoriteDelta = vi.fn();
    const context = {
      ...createFocusedStores({
        overview: { applyFavoriteDelta }
      }),
      id: 42,
      favoriteInd: 0,
      favoriteMutationPending: false,
      $emit: vi.fn()
    };

    const firstMutation = articleActionMethods.markAsFavorite.call(context);
    const secondMutation = articleActionMethods.markAsFavorite.call(context);

    expect(markAsFavorite).toHaveBeenCalledOnce();
    expect(context.favoriteMutationPending).toBe(true);

    resolveFavorite({
      data: {
        feedId: 3,
        feed: { categoryId: 2 },
        favoriteInd: 1
      }
    });
    await Promise.all([firstMutation, secondMutation]);

    expect(applyFavoriteDelta).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledOnce();
    expect(context.favoriteMutationPending).toBe(false);
  });

  it('emits the existing click and removal payloads after successful API actions', async () => {
    markClicked.mockResolvedValue({ data: { clickedAmount: 4 } });
    markNotInterested.mockResolvedValue({});
    const context = {
      id: 42,
      clickedAmount: 3,
      clickMutationPending: false,
      $emit: vi.fn()
    };

    articleActionMethods.articleClicked.call(context);
    articleActionMethods.markNotInterested.call(context);
    await flushPromises();

    expect(markClicked).toHaveBeenCalledWith(42);
    expect(markNotInterested).toHaveBeenCalledWith(42);
    expect(context.$emit).toHaveBeenCalledWith(
      'update-clicked',
      { id: 42, clickedAmount: 4 }
    );
    expect(context.$emit).toHaveBeenCalledWith(
      'article-not-interested',
      { id: 42 }
    );
  });

  it('does not emit a fabricated click count when persistence fails', async () => {
    markClicked.mockRejectedValue(new Error('offline'));
    const context = {
      id: 42,
      clickedAmount: 5,
      clickMutationPending: false,
      $emit: vi.fn()
    };

    await articleActionMethods.articleClicked.call(context);

    expect(context.$emit).not.toHaveBeenCalled();
    expect(context.clickMutationPending).toBe(false);
  });

  it('keeps extracted behavior on the Article Options API surface', () => {
    expect(Article.methods.onSwipeTouchMove)
      .toBe(articleMobileSwipeMethods.onSwipeTouchMove);
    expect(Article.methods.viewEventArticles)
      .toBe(articleExpansionMethods.viewEventArticles);
    expect(Article.methods.markAsFavorite)
      .toBe(articleActionMethods.markAsFavorite);
    expect(Article.computed.articleSignals)
      .toBe(articleSignalComputed.articleSignals);
  });
});
