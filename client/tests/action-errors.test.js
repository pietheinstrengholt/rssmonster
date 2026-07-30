import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionErrorNotice from '../src/components/ActionErrorNotice.vue';
import ArticleFeed from '../src/components/ArticleFeed.vue';
import DesktopToolbar from '../src/components/DesktopToolbar.vue';
import NewFeed from '../src/components/model/NewFeed.vue';
import SettingsActions from '../src/components/model/SettingsActions.vue';
import {
  ACTION_ERROR_EVENT,
  isFatalActionError,
  notifyActionError
} from '../src/services/actionNotifications.js';
import { markArticleUnread } from '../src/api/articles';
import { createFeed } from '../src/api/feeds';
import { saveActions } from '../src/api/actions';
import { saveThemeMode } from '../src/api/settings';

vi.mock('../src/api/articles', () => ({
  fetchArticleDetails: vi.fn(),
  fetchArticleIds: vi.fn(),
  markArticleSeen: vi.fn(),
  markArticleUnread: vi.fn(),
  markArticlesAsRead: vi.fn(),
  markAsFavorite: vi.fn(),
  markManyAsFavorite: vi.fn(),
  markManyClicked: vi.fn()
}));

vi.mock('../src/api/feeds', () => ({
  createFeed: vi.fn(),
  validateFeed: vi.fn()
}));

vi.mock('../src/api/actions', () => ({
  fetchActions: vi.fn(),
  saveActions: vi.fn()
}));

vi.mock('../src/api/settings', () => ({
  saveThemeMode: vi.fn()
}));

// This function captures the next recoverable action error notification.
const captureActionError = () => new Promise(resolve => {
  window.addEventListener(ACTION_ERROR_EVENT, event => resolve(event.detail), { once: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recoverable action errors', () => {
  it('renders a concise accessible notice that can be dismissed', async () => {
    const wrapper = mount(ActionErrorNotice, {
      props: { message: 'Could not save this feed. Please try again.' }
    });

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save this feed.');
    await wrapper.get('button[aria-label="Dismiss error"]').trigger('click');
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });

  it('keeps offline and authentication failures in the fatal AppError flow', () => {
    const listener = vi.fn();
    window.addEventListener(ACTION_ERROR_EVENT, listener);

    expect(isFatalActionError({ response: { status: 401 } })).toBe(true);
    expect(notifyActionError('Local message', { request: {}, message: 'Network Error' })).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(ACTION_ERROR_EVENT, listener);
  });

  it('notifies when an article status action fails', async () => {
    const error = { response: { status: 500 } };
    markArticleUnread.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notification = captureActionError();
    const context = {
      pendingReadStatusArticleIds: new Set(),
      pool: new Set(),
      $store: { data: {} },
      updateArticleStatusLocal: vi.fn()
    };

    await ArticleFeed.methods.toggleArticleReadStatus.call(context, {
      id: 42,
      status: 'read'
    });

    await expect(notification).resolves.toEqual({
      message: 'Could not update the article status. Please try again.'
    });
    expect(context.pendingReadStatusArticleIds.size).toBe(0);
    expect(console.error).toHaveBeenCalledWith('Error toggling article read status:', error);
  });

  it('notifies when adding a feed fails and keeps the form state available', async () => {
    const error = { response: { status: 500 } };
    createFeed.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notification = captureActionError();
    const context = {
      selectedCategory: 3,
      crawlSince: '7d',
      feed: {
        feedName: 'Example',
        feedDesc: '',
        feedType: 'rss',
        url: 'https://example.com/feed.xml'
      }
    };

    await NewFeed.methods.newFeed.call(context);

    await expect(notification).resolves.toEqual({
      message: 'Could not add this feed. Please try again.'
    });
    expect(context.feed.url).toBe('https://example.com/feed.xml');
    expect(console.error).toHaveBeenCalledWith(
      'Error adding feed URL https://example.com/feed.xml:',
      error
    );
  });

  it('notifies when Settings actions fail and does not close the section', async () => {
    const error = { response: { status: 500 } };
    saveActions.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notification = captureActionError();
    const context = {
      actions: [{ name: 'Archive ads', actionType: 'discard', regularExpression: 'ad' }],
      $emit: vi.fn()
    };

    await SettingsActions.methods.save.call(context);

    await expect(notification).resolves.toEqual({
      message: 'Could not save article actions. Please try again.'
    });
    expect(context.$emit).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Error saving article actions:', error);
  });

  it('notifies and rolls back when saving a theme preference fails', async () => {
    const error = { response: { status: 500 } };
    saveThemeMode.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notification = captureActionError();
    const context = {
      selectedThemeMode: 'auto',
      $store: {
        data: {
          setThemeMode: vi.fn()
        }
      }
    };

    await DesktopToolbar.methods.selectThemeMode.call(context, 'dark');

    await expect(notification).resolves.toEqual({
      message: 'Could not save the theme preference. Please try again.'
    });
    expect(context.selectedThemeMode).toBe('auto');
    expect(context.$store.data.setThemeMode).toHaveBeenLastCalledWith('auto');
    expect(console.error).toHaveBeenCalledWith('Error saving theme mode:', error);
  });
});
