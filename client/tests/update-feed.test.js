import { beforeEach, describe, expect, it, vi } from 'vitest';

import UpdateFeed from '../src/components/model/UpdateFeed.vue';
import {
  deleteFeed,
  rediscoverRss,
  updateFeed
} from '../src/api/feeds';
import { setAuthToken } from '../src/api/client';
import { notifyActionError } from '../src/services/actionNotifications.js';

vi.mock('../src/api/feeds', () => ({
  deleteFeed: vi.fn(),
  rediscoverRss: vi.fn(),
  updateFeed: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

// Creates an UpdateFeed context backed by focused store action spies.
const createContext = (overrides = {}) => {
  const sourceFeed = {
    id: 10,
    categoryId: 1,
    feedName: 'Example',
    feedDesc: 'Description',
    url: 'https://example.com/feed',
    status: 'active'
  };
  const componentData = UpdateFeed.data();

  return {
    ...componentData,
    $store: {
      auth: { token: 'token' },
      data: {
        categories: [
          { id: 1, feeds: [sourceFeed] },
          { id: 2, feeds: [] }
        ],
        currentSelection: {
          feedId: '10',
          AIEnabled: true
        },
        updateFeed: vi.fn().mockReturnValue(true),
        removeFeed: vi.fn().mockReturnValue(true),
        selectFeed: vi.fn(),
        setShowModal: vi.fn()
      }
    },
    ...UpdateFeed.methods,
    ...overrides
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('UpdateFeed', () => {
  // Verifies initialization clones the selected feed and supplies processing defaults.
  it('initializes editable state without mutating the store feed', () => {
    const context = createContext();
    const sourceFeed = context.$store.data.categories[0].feeds[0];

    context.initializeFeed();
    context.feed.feedName = 'Changed locally';
    context.feed.feedTags.push('local');

    expect(context.feed).toMatchObject({
      id: 10,
      updateIntervalMinutes: null,
      feedTags: ['local'],
      generateEmbeddings: true,
      applyAiAnalysis: true
    });
    expect(sourceFeed.feedName).toBe('Example');
    expect(sourceFeed.feedTags).toBeUndefined();
    expect(context.originalFeed).toEqual(sourceFeed);
  });

  // Verifies feed selection changes can reinitialize an existing feed while missing IDs are harmless.
  it('reinitializes when the selected feed changes', () => {
    const context = createContext();
    context.$store.data.categories[1].feeds.push({
      id: 20,
      categoryId: 2,
      feedName: 'Second',
      feedTags: ['news'],
      updateIntervalMinutes: 60,
      generateEmbeddings: false,
      applyAiAnalysis: false
    });

    context.$store.data.currentSelection.feedId = '20';
    context.initializeFeed();
    expect(context.feed).toMatchObject({
      id: 20,
      feedName: 'Second',
      feedTags: ['news'],
      updateIntervalMinutes: 60,
      generateEmbeddings: false,
      applyAiAnalysis: false
    });

    context.$store.data.currentSelection.feedId = 'missing';
    context.initializeFeed();
    expect(context.feed.id).toBe(20);
  });

  // Verifies tag input presents and normalizes comma- or whitespace-separated labels.
  it('gets and sets feed tags through the computed input contract', () => {
    const context = createContext();
    context.feed = { feedTags: ['ai', 'security'] };

    expect(UpdateFeed.computed.feedTagsInput.get.call(context)).toBe('ai, security');
    UpdateFeed.computed.feedTagsInput.set.call(context, ' ai, security  must-read ');
    expect(context.feed.feedTags).toEqual(['ai', 'security', 'must-read']);

    context.feed.feedTags = null;
    expect(UpdateFeed.computed.feedTagsInput.get.call(context)).toBe('');
  });

  // Verifies updates send every editable field and reconcile a category move.
  it('saves the feed payload and selects a moved feed', async () => {
    const context = createContext();
    context.initializeFeed();
    context.feed = {
      ...context.feed,
      feedName: 'Updated',
      feedDesc: 'New description',
      categoryId: 2,
      url: 'https://example.com/new.xml',
      status: 'disabled',
      updateIntervalMinutes: 30,
      feedTags: ['updated'],
      generateEmbeddings: false,
      applyAiAnalysis: false
    };
    updateFeed.mockResolvedValue({
      data: { feed: { ...context.feed } }
    });

    await context.updateFeed();

    expect(updateFeed).toHaveBeenCalledWith(10, {
      feedName: 'Updated',
      feedDesc: 'New description',
      categoryId: 2,
      url: 'https://example.com/new.xml',
      status: 'disabled',
      updateIntervalMinutes: 30,
      feedTags: ['updated'],
      generateEmbeddings: false,
      applyAiAnalysis: false
    });
    expect(context.$store.data.updateFeed).toHaveBeenCalledWith({
      ...context.feed,
      errorCount: 0
    });
    expect(context.$store.data.selectFeed).toHaveBeenCalledWith(10, 2);
    expect(context.$store.data.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies save failures preserve the modal and notify the user.
  it('reports update failures without closing the modal', async () => {
    const context = createContext();
    context.initializeFeed();
    const error = new Error('save failed');
    updateFeed.mockRejectedValue(error);

    await context.updateFeed();

    expect(context.$store.data.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save this feed. Please try again.',
      error
    );
  });

  // Verifies RSS rediscovery handles suggestions, empty responses, and AI-disabled feeds.
  it('rediscover RSS updates the URL and always clears loading state', async () => {
    const context = createContext();
    context.initializeFeed();
    rediscoverRss.mockResolvedValueOnce({
      data: {
        suggestedUrl: 'https://example.com/discovered.xml',
        confidence: 95
      }
    }).mockResolvedValueOnce({
      data: {
        suggestedUrl: '',
        confidence: 20,
        reason: 'No candidate'
      }
    });

    await context.rediscoverRss();
    expect(context.feed.url).toBe('https://example.com/discovered.xml');
    expect(context.rediscovering).toBe(false);

    await context.rediscoverRss();
    expect(context.rediscoveredRss.reason).toBe('No candidate');

    context.$store.data.currentSelection.AIEnabled = false;
    expect(await context.rediscoverRss()).toBe(false);
    expect(rediscoverRss).toHaveBeenCalledTimes(2);
  });

  // Verifies rediscovery uses server suggestion details or a generic action error.
  it('handles both structured and generic rediscovery failures', async () => {
    const context = createContext();
    context.initializeFeed();
    rediscoverRss.mockRejectedValueOnce({
      response: { data: { suggestedUrl: '', reason: 'Invalid site' } }
    });

    await context.rediscoverRss();
    expect(context.rediscoveredRss.reason).toBe('Invalid site');
    expect(notifyActionError).not.toHaveBeenCalled();

    const error = new Error('offline');
    rediscoverRss.mockRejectedValueOnce(error);
    await context.rediscoverRss();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not rediscover this feed. Please try again.',
      error
    );
    expect(context.rediscovering).toBe(false);
  });

  // Verifies deletion honors guards and reconciles successful removal.
  it('confirms and deletes the selected feed once', async () => {
    const context = createContext();
    context.initializeFeed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteFeed.mockResolvedValue({});

    await context.deleteFeed();

    expect(confirm).toHaveBeenCalledWith(
      'Delete "Example" and all related articles?'
    );
    expect(deleteFeed).toHaveBeenCalledWith(10);
    expect(context.$store.data.removeFeed).toHaveBeenCalledWith(10);
    expect(context.$store.data.selectFeed).toHaveBeenCalledWith('%');
    expect(context.$store.data.setShowModal).toHaveBeenCalledWith('');
    expect(context.deleting).toBe(false);

    context.deleting = true;
    await context.deleteFeed();
    expect(deleteFeed).toHaveBeenCalledOnce();
  });

  // Verifies cancellation and failed deletion leave local state intact.
  it('cancels or reports deletion without removing local state', async () => {
    const context = createContext();
    context.initializeFeed();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    await context.deleteFeed();
    expect(deleteFeed).not.toHaveBeenCalled();

    const error = new Error('delete failed');
    deleteFeed.mockRejectedValue(error);
    await context.deleteFeed();

    expect(context.$store.data.removeFeed).not.toHaveBeenCalled();
    expect(context.deleting).toBe(false);
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not delete this feed. Please try again.',
      error
    );
  });

  // Verifies the component authenticates API calls during creation.
  it('sets the shared API token when created', () => {
    const context = createContext();

    UpdateFeed.created.call(context);

    expect(setAuthToken).toHaveBeenCalledWith('token');
  });
});
