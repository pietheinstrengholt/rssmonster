import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import NewFeed from '../src/components/model/NewFeed.vue';
import { createFeed, validateFeed } from '../src/api/feeds';
import { setAuthToken } from '../src/api/client';
import { notifyActionError } from '../src/services/actionNotifications.js';

vi.mock('../src/api/feeds', () => ({
  createFeed: vi.fn(),
  validateFeed: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

let wrapper;

// Mounts the feed modal with observable store reconciliation methods.
const mountNewFeed = (categories = [{ id: 3, name: 'Technology' }]) => {
  const store = {
    auth: { token: 'token' },
    data: {
      categories,
      addFeed: vi.fn(),
      increaseRefreshCategories: vi.fn(),
      setShowModal: vi.fn()
    }
  };

  wrapper = mount(NewFeed, {
    global: {
      mocks: { $store: store },
      stubs: { BootstrapIcon: true }
    }
  });

  return { wrapper, store };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('NewFeed', () => {
  // Verifies the modal initializes authentication and explains the category prerequisite.
  it('renders the empty category state and supports closing', async () => {
    const { store } = mountNewFeed([]);

    expect(setAuthToken).toHaveBeenCalledWith('token');
    expect(wrapper.text()).toContain('First create a new category');
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);

    await wrapper.get('.feed-modal-close').trigger('click');
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies successful validation exposes editable feed metadata and clears stale errors.
  it('validates a feed and exposes the save action', async () => {
    validateFeed.mockResolvedValue({
      data: {
        feedName: 'Example',
        feedDesc: 'News',
        feedType: 'rss',
        url: 'https://example.com/feed.xml'
      }
    });
    mountNewFeed();
    await wrapper.setData({
      url: 'https://example.com',
      selectedCategory: 3,
      error_msg: 'Old error',
      isCloudflare: true,
      cloudflareUrl: 'https://old.example'
    });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(validateFeed).toHaveBeenCalledWith('https://example.com', 3);
    expect(wrapper.vm.ajaxRequest).toBe(false);
    expect(wrapper.vm.error_msg).toBe('');
    expect(wrapper.vm.isCloudflare).toBe(false);
    expect(wrapper.vm.cloudflareUrl).toBeNull();
    expect(wrapper.get('#inputFeedName').element.value).toBe('Example');
    expect(wrapper.text()).toContain('Save changes');
  });

  // Verifies ordinary validation failures remain retryable without offering a force-add action.
  it('reports an ordinary validation failure', async () => {
    const error = new Error('invalid feed');
    validateFeed.mockRejectedValue(error);
    mountNewFeed();
    await wrapper.setData({ url: 'not-a-feed', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.vm.ajaxRequest).toBe(false);
    expect(wrapper.vm.isCloudflare).toBe(false);
    expect(wrapper.vm.cloudflareUrl).toBeNull();
    expect(wrapper.text()).toContain('Could not validate this feed');
    expect(console.error).toHaveBeenCalledWith('Error validating feed URL not-a-feed:', error);
  });

  // Verifies bot-protected validation failures retain the canonical URL for manual creation.
  it('offers manual creation for a Cloudflare-protected feed', async () => {
    validateFeed.mockRejectedValue({
      response: {
        data: {
          cloudflare: true,
          feedUrl: 'https://example.com/protected.xml'
        }
      }
    });
    mountNewFeed();
    await wrapper.setData({ url: 'https://example.com', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.vm.cloudflareUrl).toBe('https://example.com/protected.xml');
    expect(wrapper.text()).toContain('Add feed anyway');
  });

  // Verifies manual creation derives a useful name and reconciles the persisted feed.
  it('force-adds a protected feed', async () => {
    const persistedFeed = { id: 9, feedName: 'example.com' };
    createFeed.mockResolvedValue({ data: { feed: persistedFeed } });
    const { store } = mountNewFeed();
    await wrapper.setData({
      selectedCategory: 3,
      cloudflareUrl: 'https://example.com/protected.xml',
      crawlSince: '1m'
    });

    await wrapper.vm.forceAdd();

    expect(createFeed).toHaveBeenCalledWith({
      categoryId: 3,
      feedName: 'example.com',
      feedDesc: null,
      feedType: 'rss',
      url: 'https://example.com/protected.xml',
      status: 'active',
      crawlSince: '1m'
    });
    expect(store.data.addFeed).toHaveBeenCalledWith(3, persistedFeed);
    expect(store.data.increaseRefreshCategories).toHaveBeenCalledOnce();
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies malformed manual URLs fall back to their raw value and preserve the form on failure.
  it('keeps force-add failures editable for malformed URLs', async () => {
    const error = new Error('create failed');
    createFeed.mockRejectedValue(error);
    const { store } = mountNewFeed();
    await wrapper.setData({
      url: 'example feed',
      selectedCategory: 3
    });

    await wrapper.vm.forceAdd();

    expect(createFeed).toHaveBeenCalledWith(expect.objectContaining({
      feedName: 'example feed',
      url: 'example feed'
    }));
    expect(wrapper.vm.error_msg).toBe('Could not add this feed. Please try again.');
    expect(store.data.addFeed).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Error force-adding feed URL example feed:',
      error
    );
  });

  // Verifies saving validated metadata replaces it with the persisted store representation.
  it('creates a validated feed and closes the modal', async () => {
    const persistedFeed = { id: 10, feedName: 'Saved feed' };
    createFeed.mockResolvedValue({ status: 201, data: { feed: persistedFeed } });
    const { store } = mountNewFeed();
    await wrapper.setData({
      selectedCategory: 3,
      crawlSince: '3m',
      feed: {
        feedName: 'Draft feed',
        feedDesc: 'Description',
        feedType: 'atom',
        url: 'https://example.com/atom.xml'
      }
    });

    await wrapper.vm.newFeed();

    expect(createFeed).toHaveBeenCalledWith({
      categoryId: 3,
      feedName: 'Draft feed',
      feedDesc: 'Description',
      feedType: 'atom',
      url: 'https://example.com/atom.xml',
      status: 'active',
      crawlSince: '3m'
    });
    expect(wrapper.vm.feed).toEqual(persistedFeed);
    expect(store.data.addFeed).toHaveBeenCalledWith(3, persistedFeed);
    expect(store.data.increaseRefreshCategories).toHaveBeenCalledOnce();
    expect(store.data.setShowModal).toHaveBeenCalledWith('');
    expect(console.log).toHaveBeenCalledWith(201);
  });

  // Verifies save failures use the shared recoverable action notification.
  it('reports validated feed creation failures', async () => {
    const error = new Error('create failed');
    createFeed.mockRejectedValue(error);
    const { store } = mountNewFeed();
    await wrapper.setData({
      selectedCategory: 3,
      feed: {
        feedName: 'Draft feed',
        feedDesc: '',
        feedType: 'rss',
        url: 'https://example.com/feed.xml'
      }
    });

    await wrapper.vm.newFeed();

    expect(store.data.addFeed).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not add this feed. Please try again.',
      error
    );
  });
});
