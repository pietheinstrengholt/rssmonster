import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

import ArticleListView from '../src/components/articles/ArticleListView.vue';

// Creates a keyboard-navigation context with rendered article references.
const createContext = (overrides = {}) => {
  const elements = new Map();

  // Creates a focusable article element at a stable viewport position.
  const createArticleElement = (top) => ({
    focus: vi.fn(),
    scrollIntoView: vi.fn(),
    getBoundingClientRect: vi.fn().mockReturnValue({ top }),
    querySelector: vi.fn()
  });

  elements.set(1, createArticleElement(80));
  elements.set(2, createArticleElement(20));
  elements.set(3, createArticleElement(140));

  return {
    articles: [
      { id: 1, status: 'unread' },
      { id: 2, status: 'read' },
      { id: 3, status: 'unread' }
    ],
    viewMode: 'full',
    activeMinimalArticleId: null,
    selectedArticleId: null,
    minimalArticleRefs: Object.fromEntries(
      [...elements].map(([id, element]) => [id, { $el: element }])
    ),
    $emit: vi.fn(),
    $nextTick: vi.fn(callback => callback()),
    ...ArticleListView.methods,
    ...overrides
  };
};

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ArticleListView keyboard navigation', () => {
  // Verifies ignored targets include form, interactive, editable, and modified events.
  it('ignores keyboard navigation from interactive contexts', () => {
    const context = createContext();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editable.appendChild(child);

    expect(context.shouldIgnoreKeyboardEvent({ target: document.createElement('input') })).toBe(true);
    expect(context.shouldIgnoreKeyboardEvent({ target: document.createElement('button') })).toBe(true);
    expect(context.shouldIgnoreKeyboardEvent({ target: child })).toBe(true);
    expect(context.shouldIgnoreKeyboardEvent({ target: document.body, metaKey: true })).toBe(true);
    expect(context.shouldIgnoreKeyboardEvent({ target: document.body })).toBe(false);
  });

  // Verifies J/K and arrow keys establish selection and stop at list boundaries.
  it('navigates forward and backward with stable boundaries', () => {
    const context = createContext();
    const preventDefault = vi.fn();

    context.handleMinimalKeydown({ key: 'j', target: document.body, preventDefault });
    expect(context.selectedArticleId).toBe(3);

    context.handleMinimalKeydown({ key: 'ArrowDown', target: document.body, preventDefault });
    expect(context.selectedArticleId).toBe(3);

    context.handleMinimalKeydown({ key: 'k', target: document.body, preventDefault });
    expect(context.selectedArticleId).toBe(2);

    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(context.minimalArticleRefs[2].$el.scrollIntoView)
      .toHaveBeenCalledWith({ block: 'nearest' });
  });

  // Verifies minimal navigation emits the existing open contract instead of local selection.
  it('opens the next compact article through the parent contract', () => {
    const context = createContext({
      viewMode: 'minimal',
      activeMinimalArticleId: 1
    });

    context.handleMinimalKeydown({
      key: 'ArrowDown',
      target: document.body,
      preventDefault: vi.fn()
    });

    expect(context.$emit).toHaveBeenCalledWith(
      'minimal-article-opened',
      { id: 2, status: 'read' }
    );
    expect(context.minimalArticleRefs[1].$el.focus).toHaveBeenCalled();
  });

  // Verifies open, read, and favorite shortcuts act on the selected article.
  it('routes open, read, and favorite shortcuts for the selected article', () => {
    const context = createContext({ selectedArticleId: 2 });
    const articleLink = { click: vi.fn() };
    context.minimalArticleRefs[2].$el.querySelector.mockReturnValue(articleLink);

    for (const key of ['Enter', 'm', 's']) {
      context.handleMinimalKeydown({
        key,
        target: document.body,
        preventDefault: vi.fn()
      });
    }

    expect(articleLink.click).toHaveBeenCalledOnce();
    expect(context.$emit).toHaveBeenCalledWith(
      'shortcut-toggle-read',
      { id: 2, status: 'read' }
    );
    expect(context.$emit).toHaveBeenCalledWith(
      'shortcut-toggle-favorite',
      { id: 2 }
    );
  });

  // Verifies viewport selection chooses the closest mounted article.
  it('selects the article closest to the reading viewport', () => {
    const home = document.createElement('div');
    home.id = 'home';
    home.getBoundingClientRect = vi.fn().mockReturnValue({ top: 10 });
    document.body.appendChild(home);
    const context = createContext();

    expect(context.closestArticleIdToViewport()).toBe(2);
    expect(context.selectedArticle().id).toBe(2);

    context.minimalArticleRefs = {};
    expect(context.closestArticleIdToViewport()).toBeNull();
    expect(context.selectedArticle()).toBeNull();
  });

  // Verifies compact focus and tabindex state follow the active article.
  it('focuses and scrolls only the active compact article', () => {
    const context = createContext({
      viewMode: 'minimal',
      activeMinimalArticleId: '2'
    });

    expect(context.isMinimalArticleSelected(2)).toBe(true);
    expect(context.minimalArticleTabindex(2)).toBe(0);
    expect(context.minimalArticleTabindex(1)).toBe(-1);
    context.focusSelectedMinimalArticle({ preventScroll: true });

    expect(context.minimalArticleRefs[2].$el.focus)
      .toHaveBeenCalledWith({ preventScroll: true });
    expect(context.minimalArticleRefs[2].$el.scrollIntoView)
      .toHaveBeenCalledWith({ block: 'nearest' });

    context.viewMode = 'full';
    expect(context.minimalArticleTabindex(2)).toBeNull();
  });

  // Verifies empty lists and unrelated keys remain inert.
  it('does nothing for empty lists, unrelated keys, or missing selections', () => {
    const context = createContext({ articles: [] });
    const preventDefault = vi.fn();

    context.handleMinimalKeydown({ key: 'j', target: document.body, preventDefault });
    context.handleMinimalKeydown({ key: 'x', target: document.body, preventDefault });
    context.openSelectedArticle();
    context.toggleSelectedReadStatus();
    context.toggleSelectedFavorite();

    expect(preventDefault).not.toHaveBeenCalled();
    expect(context.$emit).not.toHaveBeenCalled();
  });

  // Verifies the component owns its global keydown listener for exactly its mounted lifetime.
  it('registers and removes the window keydown listener', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const wrapper = shallowMount(ArticleListView, {
      props: {
        articles: [],
        pool: new Set(),
        container: [],
        currentSelection: 'unread',
        currentViewUnreadCount: 0,
        viewMode: 'minimal',
        remainingItems: 0,
        fetchCount: 50,
        hasLoadedContent: true,
        isFlushed: false,
        distance: 0
      }
    });
    const handler = wrapper.vm.handleMinimalKeydown;

    expect(addEventListener).toHaveBeenCalledWith('keydown', handler);
    wrapper.unmount();
    expect(removeEventListener).toHaveBeenCalledWith('keydown', handler);
  });
});
