import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Article from '../src/components/Article.vue';
import {
  fetchDuplicateArticles,
  markAsFavorite,
  markClicked,
  markNotInterested
} from '../src/api/articles.js';
import { fetchEventArticles } from '../src/api/events.js';
import { fetchTopicArticles } from '../src/api/topics.js';
import { articleActionMethods } from '../src/components/articles/articleActions.js';
import {
  createArticleExpansionState,
  articleExpansionMethods
} from '../src/components/articles/articleExpansion.js';
import { articleSignalComputed } from '../src/components/articles/articleSignals.js';
import {
  createArticleMobileSwipeState,
  articleMobileSwipeMethods
} from '../src/components/articles/mobileSwipe.js';

vi.mock('../src/api/articles.js', () => ({
  fetchDuplicateArticles: vi.fn(),
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn()
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
  return {
    ...createArticleExpansionState(),
    id: 42,
    $emit: vi.fn(),
    $store: {
      data: {
        currentSelection: { grouping }
      }
    }
  };
}

// Mounts an article with the minimal store and child-component surface.
function mountArticle(props = {}) {
  return shallowMount(Article, {
    props: {
      id: 42,
      title: 'Signal article',
      url: 'https://example.com/article',
      feed: { feedName: 'Example Feed' },
      ...props
    },
    global: {
      stubs: {
        ArticleActionsMenu: true,
        ArticleContent: true,
        ArticleHeader: true,
        ArticleMedia: true,
        ArticleMeta: true,
        ArticleTagsScores: true,
        BootstrapIcon: true
      },
      mocks: {
        $store: {
          data: {
            categories: [],
            currentSelection: {
              grouping: 'event',
              viewMode: 'full'
            }
          }
        }
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
        feed: { categoryId: 2 }
      }
    });
    const category = {
      id: 2,
      favoriteCount: 4,
      feeds: [{ id: 3, favoriteCount: 1 }]
    };
    const context = {
      id: 42,
      favoriteInd: 0,
      $emit: vi.fn(),
      $store: {
        data: {
          categories: [category],
          increaseFavoriteCount: vi.fn(),
          decreaseFavoriteCount: vi.fn()
        }
      }
    };

    articleActionMethods.markAsFavorite.call(context);
    await flushPromises();

    expect(markAsFavorite).toHaveBeenCalledWith(42, 'mark');
    expect(category.favoriteCount).toBe(5);
    expect(category.feeds[0].favoriteCount).toBe(2);
    expect(context.$store.data.increaseFavoriteCount).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledWith(
      'update-favorite',
      { id: 42, favoriteInd: 1 }
    );
  });

  it('emits the existing click and removal payloads after successful API actions', async () => {
    markClicked.mockResolvedValue({});
    markNotInterested.mockResolvedValue({});
    const context = {
      id: 42,
      $emit: vi.fn()
    };

    articleActionMethods.articleClicked.call(context);
    articleActionMethods.markNotInterested.call(context);
    await flushPromises();

    expect(markClicked).toHaveBeenCalledWith(42);
    expect(markNotInterested).toHaveBeenCalledWith(42);
    expect(context.$emit).toHaveBeenCalledWith(
      'update-clicked',
      { id: 42, clickedAmount: 1 }
    );
    expect(context.$emit).toHaveBeenCalledWith(
      'article-not-interested',
      { id: 42 }
    );
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
