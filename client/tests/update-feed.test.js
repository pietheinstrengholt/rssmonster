import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import UpdateFeed from '../src/components/dialogs/feeds/UpdateFeed.vue';
import {
  deleteFeed,
  rediscoverRss,
  updateFeed
} from '../src/api/feeds';
import { setAuthToken } from '../src/api/client';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

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

let wrapper;

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
  const stores = createFocusedStores({
    auth: { token: 'token' },
    overview: {
      categories: [
        { id: 1, feeds: [sourceFeed] },
        { id: 2, feeds: [] }
      ],
      updateFeed: vi.fn().mockReturnValue(true),
      removeFeed: vi.fn().mockReturnValue(true)
    },
    selection: {
      currentSelection: {
        feedId: '10',
        AIEnabled: true
      },
      selectFeed: vi.fn()
    },
    ui: {
      setShowModal: vi.fn()
    }
  });

  return {
    ...componentData,
    ...stores,
    ...UpdateFeed.methods,
    ...overrides
  };
};

// Mounts the complete feed dialog without relying on another async dialog's styles.
const mountUpdateFeed = () => {
  const feed = {
    id: 10,
    categoryId: 1,
    feedName: 'Example',
    feedDesc: 'Description',
    url: 'https://example.com/feed',
    status: 'error',
    errorSince: '2026-01-01',
    feedTags: []
  };
  const store = createFocusedStores({
    auth: { token: 'token' },
    overview: {
      categories: [
        { id: 1, name: 'News', feeds: [feed] },
        { id: 2, name: 'Technology', feeds: [] }
      ],
      updateFeed: vi.fn().mockReturnValue(true),
      removeFeed: vi.fn().mockReturnValue(true)
    },
    selection: {
      currentSelection: {
        feedId: '10',
        AIEnabled: true
      },
      selectFeed: vi.fn()
    },
    ui: {
      setShowModal: vi.fn()
    }
  });

  wrapper = mount(UpdateFeed, {
    attachTo: document.body,
    global: {
      plugins: [store.pinia]
    }
  });

  return { wrapper, store };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('UpdateFeed', () => {
  // Verifies the rendered dialog is visible through BaseDialog without generic modal CSS.
  it('renders a visible shared dialog independently', async () => {
    const { wrapper: dialogWrapper } = mountUpdateFeed();
    await flushPromises();
    const overlay = dialogWrapper.get('.base-dialog__overlay');

    expect(dialogWrapper.find('.modal').exists()).toBe(false);
    expect(dialogWrapper.get('[role="dialog"]').classes()).toContain('base-dialog__panel--lg');
    expect(window.getComputedStyle(overlay.element).display).not.toBe('none');
  });

  // Verifies an active operation disables the form and every dismissal or mutation action.
  it('locks rendered interactions while an operation is active', async () => {
    const { wrapper: dialogWrapper } = mountUpdateFeed();

    await dialogWrapper.setData({ updating: true });

    expect(dialogWrapper.get('.update-feed__fieldset').attributes('disabled')).toBeDefined();
    expect(dialogWrapper.get('.base-dialog__close').attributes('disabled')).toBeDefined();
    expect(dialogWrapper.get('.update-feed__delete').attributes('disabled')).toBeDefined();
    expect(dialogWrapper.get('.update-feed__save').attributes('disabled')).toBeDefined();
    expect(dialogWrapper.get('.update-feed__cancel').attributes('disabled')).toBeDefined();
    expect(dialogWrapper.get('.update-feed__save').text()).toBe('Updating…');
  });

  // Verifies initialization clones the selected feed and supplies processing defaults.
  it('initializes editable state without mutating the store feed', () => {
    const context = createContext();
    const sourceFeed = context.overviewStore.categories[0].feeds[0];

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
    context.overviewStore.categories[1].feeds.push({
      id: 20,
      categoryId: 2,
      feedName: 'Second',
      feedTags: ['news'],
      updateIntervalMinutes: 60,
      generateEmbeddings: false,
      applyAiAnalysis: false
    });

    context.selectionStore.currentSelection.feedId = '20';
    context.initializeFeed();
    expect(context.feed).toMatchObject({
      id: 20,
      feedName: 'Second',
      feedTags: ['news'],
      updateIntervalMinutes: 60,
      generateEmbeddings: false,
      applyAiAnalysis: false
    });

    context.selectionStore.currentSelection.feedId = 'missing';
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
    expect(context.overviewStore.updateFeed).toHaveBeenCalledWith({
      ...context.feed,
      errorCount: 0
    });
    expect(context.selectionStore.selectFeed).toHaveBeenCalledWith(10, 2);
    expect(context.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies save failures preserve the modal and notify the user.
  it('reports update failures without closing the modal', async () => {
    const context = createContext();
    context.initializeFeed();
    const error = new Error('save failed');
    updateFeed.mockRejectedValue(error);

    await context.updateFeed();

    expect(context.uiStore.setShowModal).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save this feed. Please try again.',
      error
    );
  });

  // Verifies an in-flight update blocks deletion, rediscovery, and duplicate updates.
  it('prevents incompatible operations during an update', async () => {
    const context = createContext();
    context.initializeFeed();
    const pendingRequest = Promise.withResolvers();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    updateFeed.mockReturnValue(pendingRequest.promise);

    const updateRequest = context.updateFeed();
    await context.rediscoverRss();
    await context.deleteFeed();
    await context.updateFeed();

    expect(UpdateFeed.computed.isBusy.call(context)).toBe(true);
    expect(updateFeed).toHaveBeenCalledOnce();
    expect(rediscoverRss).not.toHaveBeenCalled();
    expect(deleteFeed).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();

    pendingRequest.resolve({
      data: { feed: { ...context.feed } }
    });
    await updateRequest;

    expect(context.updating).toBe(false);
  });

  // Verifies rediscovery and deletion flags also block incompatible operations.
  it('honors rediscovery and deletion operation locks', async () => {
    const context = createContext();
    context.initializeFeed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    context.rediscovering = true;
    await context.updateFeed();
    await context.deleteFeed();
    context.rediscovering = false;
    context.deleting = true;
    await context.updateFeed();
    await context.rediscoverRss();

    expect(updateFeed).not.toHaveBeenCalled();
    expect(deleteFeed).not.toHaveBeenCalled();
    expect(rediscoverRss).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
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

    context.selectionStore.currentSelection.AIEnabled = false;
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
    expect(context.overviewStore.removeFeed).toHaveBeenCalledWith(10);
    expect(context.selectionStore.selectFeed).toHaveBeenCalledWith('%');
    expect(context.uiStore.setShowModal).toHaveBeenCalledWith('');
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

    expect(context.overviewStore.removeFeed).not.toHaveBeenCalled();
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
