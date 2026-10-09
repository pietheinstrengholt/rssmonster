import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

import {
  markAsFavorite,
  markClicked,
  markMoreLikeThis,
  markNotInterested,
  updateClickedStatus
} from '../src/api/articles.js';
import { muteFeed } from '../src/api/feeds.js';
import { articleActionMethods } from '../src/components/articles/helpers/articleActions.js';
import { notifyActionError, notifyActionSuccess } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/articles.js', () => ({
  markAsFavorite: vi.fn(),
  markClicked: vi.fn(),
  markMoreLikeThis: vi.fn(),
  markNotInterested: vi.fn(),
  updateClickedStatus: vi.fn()
}));

vi.mock('../src/api/feeds.js', () => ({
  muteFeed: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn(),
  notifyActionSuccess: vi.fn()
}));

// Creates an article action context with observable store mutations and events.
const createContext = (overrides = {}) => {
  const stores = createFocusedStores({
    overview: {
      applyFavoriteDelta: vi.fn()
    }
  });
  return {
    ...stores,
    id: 42,
    feedId: 8,
    feed: { feedName: 'Example Feed' },
    clickedAmount: 0,
    clickMutationPending: false,
    favoriteInd: 0,
    $emit: vi.fn(),
    ...articleActionMethods,
    ...overrides
  };
};

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

  it('marks an article as clicked from the actions menu', async () => {
    const context = createContext();
    updateClickedStatus.mockResolvedValue({ data: { clickedAmount: 1 } });

    await context.toggleClicked();

    expect(updateClickedStatus).toHaveBeenCalledWith(42, 'mark');
    expect(context.$emit).toHaveBeenCalledWith('update-clicked', {
      id: 42,
      clickedAmount: 1
    });
    expect(context.clickMutationPending).toBe(false);
  });

  it('unmarks a clicked article from the actions menu', async () => {
    const context = createContext({ clickedAmount: 3 });
    updateClickedStatus.mockResolvedValue({ data: { clickedAmount: 0 } });

    await context.toggleClicked();

    expect(updateClickedStatus).toHaveBeenCalledWith(42, 'unmark');
    expect(context.$emit).toHaveBeenCalledWith('update-clicked', {
      id: 42,
      clickedAmount: 0
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

    expect(markAsFavorite).toHaveBeenCalledWith(42, 'mark', expect.objectContaining({ id: expect.any(Number) }));
    expect(context.overviewStore.applyFavoriteDelta).toHaveBeenCalledWith({
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

    expect(markAsFavorite).toHaveBeenCalledWith(42, 'unmark', expect.objectContaining({ id: expect.any(Number) }));
    expect(context.overviewStore.applyFavoriteDelta).toHaveBeenCalledWith({
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
      'Could not update saved status. Please try again.',
      error
    );
  });

  // Negative feedback acknowledges persistence without removing the article.
  it('marks an article as not interested', async () => {
    const context = createContext();
    markNotInterested.mockResolvedValue();

    context.markNotInterested();
    await flushPromises();

    expect(markNotInterested).toHaveBeenCalledWith(42);
    expect(context.$emit).not.toHaveBeenCalled();
    expect(notifyActionSuccess).toHaveBeenCalledWith('Preference saved: less like this.');
  });

  it.each([
    ['moreLikeThis', markMoreLikeThis],
    ['markNotInterested', markNotInterested],
    ['muteFeedSevenDays', muteFeed]
  ])('acknowledges %s only after success and never on failure', async (method, api) => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    let resolve;
    api.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const context = createContext();
    context[method]();
    expect(notifyActionSuccess).not.toHaveBeenCalled();
    resolve({ data: { mutedUntil: '2026-10-06T12:00:00Z' } });
    await flushPromises();
    expect(notifyActionSuccess).toHaveBeenCalledOnce();
    notifyActionSuccess.mockClear();
    api.mockRejectedValueOnce(new Error('failed'));
    context[method]();
    await flushPromises();
    expect(notifyActionSuccess).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledOnce();
    expect(context.$emit).not.toHaveBeenCalled();
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
      'Could not save your preference. Try again.',
      error,
      expect.any(Function)
    );
  });

  // Verifies positive-interest feedback is persisted.
  it('marks an article as more like this', async () => {
    const context = createContext();
    markMoreLikeThis.mockResolvedValue();

    context.moreLikeThis();
    await flushPromises();

    expect(markMoreLikeThis).toHaveBeenCalledWith(42);
    expect(notifyActionSuccess).toHaveBeenCalledWith('Preference saved: more like this.');
  });

  // Verifies positive-interest failures use the recoverable notification flow.
  it('reports a more-like-this failure', async () => {
    const error = new Error('interest failed');
    const context = createContext();
    markMoreLikeThis.mockRejectedValue(error);

    context.moreLikeThis();
    await flushPromises();

    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save your preference. Try again.',
      error,
      expect.any(Function)
    );
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
    muteFeed.mockResolvedValue({ data: { mutedUntil: '2026-08-08T10:00:00.000Z' } });

    context.muteFeedSevenDays();
    await flushPromises();

    expect(muteFeed).toHaveBeenCalledWith(8, '2026-08-07T10:00:00.000Z');
    expect(notifyActionSuccess).toHaveBeenCalledWith('Source muted until 8 August.');
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
      'Could not mute this feed. Try again.',
      error,
      expect.any(Function)
    );
  });
});
