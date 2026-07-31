import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

import {
  markAsFavorite,
  markClicked,
  markMoreLikeThis,
  markNotInterested
} from '../src/api/articles.js';
import { muteFeed } from '../src/api/feeds.js';
import { articleActionMethods } from '../src/components/articles/articleActions.js';
import { notifyActionError } from '../src/services/actionNotifications.js';

vi.mock('../src/api/articles.js', () => ({
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn()
}));

vi.mock('../src/api/feeds.js', () => ({
  muteFeed: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

// Creates an article action context with observable store mutations and events.
const createContext = (overrides = {}) => ({
  id: 42,
  feedId: 8,
  feed: { feedName: 'Example Feed' },
  favoriteInd: 0,
  $emit: vi.fn(),
  $store: {
    data: {
      applyFavoriteDelta: vi.fn()
    }
  },
  ...articleActionMethods,
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('articleActionMethods', () => {
  // Verifies click tracking always reconciles the local clicked state.
  it('marks an article clicked and emits the local update', async () => {
    const context = createContext();
    markClicked.mockResolvedValue();

    context.articleClicked();
    await flushPromises();

    expect(markClicked).toHaveBeenCalledWith(42);
    expect(context.$emit).toHaveBeenCalledWith('update-clicked', {
      id: 42,
      clickedAmount: 1
    });
  });

  // Verifies marking a favorite updates overview counts and the article state.
  it('marks an article as favorite', async () => {
    const context = createContext();
    markAsFavorite.mockResolvedValue({
      data: {
        feedId: 8,
        feed: { categoryId: 3 }
      }
    });

    context.markAsFavorite();
    await flushPromises();

    expect(markAsFavorite).toHaveBeenCalledWith(42, 'mark');
    expect(context.$store.data.applyFavoriteDelta).toHaveBeenCalledWith({
      categoryId: 3,
      feedId: 8,
      delta: 1
    });
    expect(context.$emit).toHaveBeenCalledWith('update-favorite', {
      id: 42,
      favoriteInd: 1
    });
  });

  // Verifies unmarking a favorite decrements overview counts.
  it('unmarks an existing favorite', async () => {
    const context = createContext({ favoriteInd: 1 });
    markAsFavorite.mockResolvedValue({
      data: {
        feedId: 8,
        feed: null
      }
    });

    context.markAsFavorite();
    await flushPromises();

    expect(markAsFavorite).toHaveBeenCalledWith(42, 'unmark');
    expect(context.$store.data.applyFavoriteDelta).toHaveBeenCalledWith({
      categoryId: undefined,
      feedId: 8,
      delta: -1
    });
    expect(context.$emit).toHaveBeenCalledWith('update-favorite', {
      id: 42,
      favoriteInd: 0
    });
  });

  // Verifies favorite failures are logged and surfaced without local mutation.
  it('reports a favorite failure', async () => {
    const error = new Error('favorite failed');
    const context = createContext();
    markAsFavorite.mockRejectedValue(error);

    context.markAsFavorite();
    await flushPromises();

    expect(context.$emit).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not update the favorite. Please try again.',
      error
    );
  });

  // Verifies negative feedback removes the article after persistence succeeds.
  it('marks an article as not interested', async () => {
    const context = createContext();
    markNotInterested.mockResolvedValue();

    context.markNotInterested();
    await flushPromises();

    expect(markNotInterested).toHaveBeenCalledWith(42);
    expect(context.$emit).toHaveBeenCalledWith('article-not-interested', { id: 42 });
  });

  // Verifies negative-feedback failures remain visible and do not remove the article.
  it('reports a not-interested failure', async () => {
    const error = new Error('feedback failed');
    const context = createContext();
    markNotInterested.mockRejectedValue(error);

    context.markNotInterested();
    await flushPromises();

    expect(context.$emit).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not update this article. Please try again.',
      error
    );
  });

  // Verifies positive-interest feedback is persisted.
  it('marks an article as more like this', async () => {
    const context = createContext();
    markMoreLikeThis.mockResolvedValue();

    context.moreLikeThis();
    await flushPromises();

    expect(markMoreLikeThis).toHaveBeenCalledWith(42);
    expect(console.log).toHaveBeenCalledWith('Marked as more like this:', 42);
  });

  // Verifies positive-interest failures use the recoverable notification flow.
  it('reports a more-like-this failure', async () => {
    const error = new Error('interest failed');
    const context = createContext();
    markMoreLikeThis.mockRejectedValue(error);

    context.moreLikeThis();
    await flushPromises();

    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not update this article. Please try again.',
      error
    );
  });

  // Verifies both negative-interest aliases share the not-interested behavior.
  it('delegates less-like-this and ignore-topic actions', () => {
    const markNotInterestedMethod = vi.fn();
    const context = createContext({ markNotInterested: markNotInterestedMethod });

    context.lessLikeThis();
    context.ignoreTopic();

    expect(markNotInterestedMethod).toHaveBeenCalledTimes(2);
  });

  // Verifies declining confirmation leaves the feed unchanged.
  it('does not mute a feed when confirmation is declined', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const context = createContext();

    context.muteFeedSevenDays();

    expect(confirm).toHaveBeenCalledWith('Mute "Example Feed" for 7 days?');
    expect(muteFeed).not.toHaveBeenCalled();
  });

  // Verifies confirmed feed muting uses an exact seven-day expiry.
  it('mutes a feed for seven days after confirmation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T10:00:00.000Z'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    const context = createContext();
    muteFeed.mockResolvedValue();

    context.muteFeedSevenDays();
    await flushPromises();

    expect(muteFeed).toHaveBeenCalledWith(8, '2026-08-07T10:00:00.000Z');
    expect(console.log).toHaveBeenCalledWith(
      'Feed muted until:',
      new Date('2026-08-07T10:00:00.000Z')
    );
  });

  // Verifies mute failures use the recoverable notification flow.
  it('reports a feed mute failure', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const error = new Error('mute failed');
    const context = createContext();
    muteFeed.mockRejectedValue(error);

    context.muteFeedSevenDays();
    await flushPromises();

    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not mute this feed. Please try again.',
      error
    );
  });
});
