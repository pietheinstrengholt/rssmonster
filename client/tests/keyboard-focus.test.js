import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../src/components/model/Settings.vue';
import ArticleReaderLayout from '../src/components/ArticleReaderLayout.vue';

// This function mounts Settings with the store values required by its navigation.
const mountSettings = () => mount(Settings, {
  attachTo: document.body,
  global: {
    mocks: {
      $store: {
        auth: { getRole: 'user' },
        data: {
          currentSelection: { AIEnabled: false },
          smartFolders: []
        }
      }
    }
  }
});

// This function mounts a two-item reader list for keyboard navigation tests.
const mountReaderLayout = () => mount(ArticleReaderLayout, {
  attachTo: document.body,
  props: {
    articles: [
      { id: 1, title: 'First article', status: 'unread', tags: [] },
      { id: 2, title: 'Second article', status: 'unread', tags: [] }
    ],
    container: [1, 2],
    currentSelection: 'unread',
    currentViewUnreadCount: 2,
    currentViewSourceCount: 2,
    remainingItems: 0,
    fetchCount: 20,
    hasLoadedContent: true,
    isFlushed: false,
    distance: 2
  },
  global: {
    mocks: {
      $store: {
        data: {
          currentSelection: {
            categoryId: '%',
            feedId: '%',
            smartFolderId: null,
            status: 'unread',
            tag: null
          },
          categories: [],
          smartFolders: [],
          setCurrentSelection: vi.fn(),
          topTags: [],
          unreadsSinceLastUpdate: 0
        }
      }
    },
    stubs: {
      Article: true,
      ArticleEndState: true,
      DailyBriefingIntro: true,
      UnreadSelectionContext: true
    }
  }
});

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('keyboard access and focus', () => {
  it('moves initial focus into Settings and closes it with Escape', async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const closeButton = wrapper.get('.settings-close-button');

    expect(document.activeElement).toBe(closeButton.element);
    await closeButton.trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('wraps forward and backward Tab focus inside Settings', async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const dialog = wrapper.get('.settings-dialog');
    const focusableElements = wrapper.vm.getFocusableElements();
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    lastElement.focus();
    await dialog.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(firstElement);

    firstElement.focus();
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastElement);
    wrapper.unmount();
  });

  // Verifies Tab falls back to the dialog when a section has no usable controls.
  it('focuses the Settings dialog when no focusable controls remain', () => {
    const focus = vi.fn();
    const preventDefault = vi.fn();
    const context = {
      $refs: {
        settingsDialog: { focus }
      },
      getFocusableElements: vi.fn(() => []),
      $emit: vi.fn()
    };

    Settings.methods.handleDialogKeydown.call(context, {
      key: 'Tab',
      shiftKey: false,
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  // Verifies an outside focus target is wrapped into the first Settings control.
  it('moves outside focus into Settings and ignores unrelated keys', () => {
    const firstElement = { focus: vi.fn() };
    const lastElement = { focus: vi.fn() };
    const preventDefault = vi.fn();
    const context = {
      $refs: {
        settingsDialog: {
          contains: vi.fn(() => false)
        }
      },
      getFocusableElements: vi.fn(() => [firstElement, lastElement]),
      $emit: vi.fn()
    };

    Settings.methods.handleDialogKeydown.call(context, {
      key: 'Tab',
      shiftKey: false,
      preventDefault
    });
    Settings.methods.handleDialogKeydown.call(context, {
      key: 'ArrowDown',
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(firstElement.focus).toHaveBeenCalledOnce();
    expect(lastElement.focus).not.toHaveBeenCalled();
  });

  it('restores focus to the Settings opener after unmount', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open settings';
    document.body.appendChild(opener);
    opener.focus();
    const wrapper = mount(Settings, {
      attachTo: document.body,
      props: {
        returnFocusTo: opener
      },
      global: {
        mocks: {
          $store: {
            auth: { getRole: 'user' },
            data: {
              currentSelection: { AIEnabled: false },
              smartFolders: []
            }
          }
        }
      }
    });
    await flushPromises();

    expect(document.activeElement).not.toBe(opener);
    wrapper.unmount();

    expect(document.activeElement).toBe(opener);
  });

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' ']
  ])('selects reader articles with %s', async (_label, key) => {
    const wrapper = mountReaderLayout();
    const items = wrapper.findAll('.readerArticleListItem');
    await wrapper.setData({ selectedArticleId: 1 });

    await items[1].trigger('keydown', { key });

    expect(items[1].attributes('aria-current')).toBe('true');
    expect(wrapper.emitted('mark-previous-article-read')?.[0]).toEqual([1]);
    wrapper.unmount();
  });

  it('moves focus with reader keyboard navigation', async () => {
    const wrapper = mountReaderLayout();
    await wrapper.setData({ selectedArticleId: 1 });

    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true
    }));
    await flushPromises();

    const items = wrapper.findAll('.readerArticleListItem');
    expect(document.activeElement).toBe(items[1].element);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    wrapper.unmount();
  });
});
