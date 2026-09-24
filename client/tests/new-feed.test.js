import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import NewFeed from '../src/components/dialogs/feeds/NewFeed.vue';
import { createFeed, validateFeed } from '../src/api/feeds';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/feeds', () => ({
  createFeed: vi.fn(),
  validateFeed: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

let wrapper;

// Creates a controllable request promise for pending-state assertions.
const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

// Mounts the feed modal with observable store reconciliation methods.
const mountNewFeed = (
  categories = [{ id: 3, name: 'Technology' }],
  ui = {}
) => {
  const store = createFocusedStores({
    auth: { token: 'token' },
    overview: {
      categories,
      addFeed: vi.fn()
    },
    ui: {
      setShowModal: vi.fn(),
      ...ui
    }
  });

  wrapper = mount(NewFeed, {
    global: {
      plugins: [store.pinia],
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
  it.each([
    ['FEED_AUTHENTICATION_FAILED', 'Authentication failed. Check the username and password.'],
    ['FEED_ACCESS_DENIED', 'Access to this feed was denied.']
  ])('shows the actionable %s validation error', async (code, error_msg) => {
    mountNewFeed();
    await wrapper.get('#feed-url').setValue('https://example.com/feed');
    validateFeed.mockRejectedValue({ response: { status: 422, data: { code, error_msg } } });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain(error_msg);
  });
  it('requires Basic credentials locally, masks the password, and sends credentials separately', async () => {
    mountNewFeed();
    await wrapper.get('#feed-url').setValue('https://example.com/feed.xml');
    expect(wrapper.find('#new-feed-authentication-password').exists()).toBe(false);
    await wrapper.get('#new-feed-authentication-type').setValue('basic');
    await wrapper.get('form').trigger('submit');
    expect(validateFeed).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Enter a username.');
    expect(wrapper.text()).toContain('Enter a password.');
    await wrapper.get('#new-feed-authentication-username').setValue('reader');
    await wrapper.get('#new-feed-authentication-password').setValue('secret');
    expect(wrapper.get('#new-feed-authentication-password').attributes('type')).toBe('password');
    await wrapper.get('[aria-label="Show password"]').trigger('click');
    expect(wrapper.get('#new-feed-authentication-password').attributes('type')).toBe('text');
    await wrapper.get('[aria-label="Hide password"]').trigger('click');
    validateFeed.mockResolvedValue({ data: { feedName: 'Example', url: 'https://example.com/feed.xml' } });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    const authentication = { authenticationType: 'basic', authenticationUsername: 'reader', authenticationPassword: 'secret' };
    expect(validateFeed).toHaveBeenCalledWith('https://example.com/feed.xml', 3, authentication);
    createFeed.mockResolvedValue({ data: { feed: { id: 1, categoryId: 3 } } });
    await wrapper.findAll('button').find(button => button.text() === 'Save changes').trigger('click');
    await flushPromises();
    expect(createFeed).toHaveBeenCalledWith(expect.objectContaining(authentication));
  });

  it('clears credentials and validated metadata when switching authentication off', async () => {
    mountNewFeed();
    await wrapper.get('#feed-url').setValue('https://example.com');
    await wrapper.get('#new-feed-authentication-type').setValue('basic');
    await wrapper.get('#new-feed-authentication-username').setValue('reader');
    await wrapper.get('#new-feed-authentication-password').setValue('secret');
    await wrapper.get('#new-feed-authentication-type').setValue('');
    expect(wrapper.find('#new-feed-authentication-password').exists()).toBe(false);
    validateFeed.mockResolvedValue({ data: {} });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(validateFeed).toHaveBeenCalledWith('https://example.com', 3);
    await wrapper.get('#new-feed-authentication-type').setValue('basic');
    expect(wrapper.get('#new-feed-authentication-username').element.value).toBe('');
    expect(wrapper.get('#new-feed-authentication-password').element.value).toBe('');
  });
  // Verifies the modal explains the category prerequisite and supports closing.
  it('renders the empty category state and supports closing', async () => {
    const { store } = mountNewFeed([]);

    expect(wrapper.text()).toContain('First create a new category');
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);

    await wrapper.get('.base-dialog__close').trigger('click');
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies BaseDialog routes Escape through NewFeed's existing close contract.
  it('closes through the shared dialog when Escape is pressed', async () => {
    const { store } = mountNewFeed();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies both Enter and the external footer submit control retain native form ownership.
  it('preserves native form submission semantics', async () => {
    validateFeed.mockResolvedValue({ data: {} });
    mountNewFeed();
    await wrapper.setData({ url: 'https://example.com' });

    const form = wrapper.get('#new-feed-form');
    const urlInput = wrapper.get('#feed-url');
    const submitButton = wrapper.get('button[type="submit"]');

    expect(urlInput.element.form).toBe(form.element);
    expect(submitButton.attributes('form')).toBe('new-feed-form');

    await form.trigger('submit');
    await flushPromises();

    expect(validateFeed).toHaveBeenCalledWith('https://example.com', 3);
  });

  // Enables validation only for qualified HTTP(S) domains, with or without a protocol.
  it.each([
    ['example.com', false],
    ['http://www.example.com', false],
    ['https://subdomain.example.com/feed.xml', false],
    ['www.example.com', false],
    ['', true],
    ['example', true],
    ['not-a-feed', true],
    ['ftp://example.com/feed.xml', true],
    ['https://user:password@example.com/feed.xml', true],
    ['https://example', true]
  ])('sets the validate action disabled state for %s', async (url, disabled) => {
    mountNewFeed();
    await wrapper.setData({ url });

    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(disabled);
  });

  // Prevents invalid URLs from bypassing the disabled action through form submission.
  it('does not submit an invalid URL', async () => {
    mountNewFeed();
    await wrapper.setData({ url: 'not-a-feed', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');

    expect(validateFeed).not.toHaveBeenCalled();
  });

  // Normalizes an accepted bare domain into the absolute URL required by feed discovery.
  it('submits a bare domain as an HTTPS URL', async () => {
    validateFeed.mockResolvedValue({ data: {} });
    mountNewFeed();
    await wrapper.setData({ url: 'example.com', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(validateFeed).toHaveBeenCalledWith('https://example.com', 3);
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

  it('clears previously validated metadata when the URL is edited', async () => {
    mountNewFeed();
    await wrapper.setData({
      url: 'https://old.example/feed.xml',
      feed: { feedName: 'Old feed', feedDesc: 'Old description' }
    });

    await wrapper.get('#feed-url').setValue('https://new.example');

    expect(wrapper.vm.feed).toEqual({});
    expect(wrapper.find('#inputFeedName').exists()).toBe(false);
  });

  // Verifies repeated validation submissions share one pending request.
  it('prevents duplicate validation submissions', async () => {
    const deferred = createDeferred();
    validateFeed.mockReturnValue(deferred.promise);
    mountNewFeed();
    await wrapper.setData({
      url: 'https://example.com',
      selectedCategory: 3
    });

    const firstRequest = wrapper.vm.checkWebsite();
    await wrapper.vm.checkWebsite();
    await wrapper.vm.$nextTick();

    expect(validateFeed).toHaveBeenCalledOnce();
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();

    deferred.resolve({ data: {} });
    await firstRequest;
  });

  // Verifies ordinary discovery failures immediately start the bounded scraper analysis.
  it('starts the scraper preview for an ordinary validation failure', async () => {
    const error = {
      response: {
        status: 422,
        data: {
          code: 'NON_FEED_CONTENT',
          error_msg: 'The URL returned HTML but not a valid RSS or Atom feed',
          pageUrl: 'https://example.com/final'
        }
      }
    };
    validateFeed.mockRejectedValue(error);
    const { store } = mountNewFeed();
    await wrapper.setData({ url: 'https://example.com', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.vm.ajaxRequest).toBe(false);
    expect(wrapper.vm.isCloudflare).toBe(false);
    expect(wrapper.vm.cloudflareUrl).toBeNull();
    expect(wrapper.text()).not.toContain('Could not validate this feed');
    expect(store.uiStore.htmlXpathDraft).toEqual({
      url: 'https://example.com/final',
      categoryId: 3,
      crawlSince: '7d',
      autoAnalyze: true
    });
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('HtmlXpathFeed');
    expect(console.error).toHaveBeenCalledWith('Error validating feed');
  });

  it('shows an error when validation fails after receiving a server error body', async () => {
    validateFeed.mockRejectedValue({
      response: {
        status: 502,
        data: { error_msg: 'Feed url is invalid. Are you sure the RSS feed is correct?' }
      }
    });
    const { store } = mountNewFeed();
    await wrapper.setData({ url: 'https://example.com', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('host may be unavailable');
    expect(store.uiStore.setShowModal).not.toHaveBeenCalledWith('HtmlXpathFeed');
  });

  // Verifies a timeout remains an error because no page is available to configure for scraping.
  it('reports a validation timeout without offering the scraper fallback', async () => {
    const error = Object.assign(new Error('timeout of 15000ms exceeded'), {
      code: 'ECONNABORTED'
    });
    validateFeed.mockRejectedValue(error);
    mountNewFeed();
    await wrapper.setData({ url: 'https://example.com', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Could not validate this feed');
    expect(wrapper.text()).not.toContain('Use HTML + XPath (Web scraping)');
  });

  // Verifies a bodyless server failure remains retryable instead of implying scrape eligibility.
  it('reports a bodyless validation failure without offering the scraper fallback', async () => {
    const error = { response: { status: 502, data: '' } };
    validateFeed.mockRejectedValue(error);
    mountNewFeed();
    await wrapper.setData({ url: 'https://example.com', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Could not validate this feed');
    expect(wrapper.text()).not.toContain('Use HTML + XPath (Web scraping)');
  });

  // Verifies the fallback action retains the same automatic-analysis transition.
  it('opens the HTML and XPath dialog from the validation fallback', async () => {
    validateFeed.mockRejectedValue({
      response: {
        status: 422,
        data: {
          code: 'NON_FEED_CONTENT',
          error_msg: 'The URL returned HTML but not a valid RSS or Atom feed'
        }
      }
    });
    const { store } = mountNewFeed();
    await wrapper.setData({ url: 'https://example.com', selectedCategory: 3 });

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    wrapper.vm.openHtmlXpathFallback();

    expect(store.uiStore.htmlXpathDraft).toEqual({
      url: 'https://example.com',
      categoryId: 3,
      crawlSince: '7d',
      autoAnalyze: true
    });
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('HtmlXpathFeed');
  });

  it('restores accepted scraper metadata into the Add Feed fields', () => {
    const sourceConfig = { item: '//article', itemTitle: './/h2' };
    const { store } = mountNewFeed(undefined, {
      htmlXpathDraft: {
        url: 'https://example.com/news',
        categoryId: 3,
        crawlSince: '1m',
        sourceConfig,
        accepted: true,
        preview: {
          feed: {
            title: 'Example News',
            description: 'Publisher updates',
            effectiveUrl: 'https://example.com/news'
          }
        }
      }
    });

    expect(wrapper.vm.url).toBe('https://example.com/news');
    expect(wrapper.vm.selectedCategory).toBe(3);
    expect(wrapper.vm.crawlSince).toBe('1m');
    expect(wrapper.vm.feed).toEqual({
      feedName: 'Example News',
      feedDesc: 'Publisher updates',
      feedType: 'html_xpath',
      url: 'https://example.com/news',
      sourceConfig
    });
    expect(wrapper.get('#inputFeedName').element.value).toBe('Example News');
    expect(wrapper.get('#inputFeedDescription').element.value).toBe('Publisher updates');
    expect(store.uiStore.htmlXpathDraft).toBeNull();
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
    expect(wrapper.text()).not.toContain('Use HTML + XPath (Web scraping)');
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
    expect(store.overviewStore.addFeed).toHaveBeenCalledWith(3, persistedFeed);
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies repeated manual-add actions cannot create the same feed twice.
  it('prevents duplicate force-add requests', async () => {
    const deferred = createDeferred();
    createFeed.mockReturnValue(deferred.promise);
    mountNewFeed();
    await wrapper.setData({
      isCloudflare: true,
      selectedCategory: 3,
      cloudflareUrl: 'https://example.com/protected.xml'
    });

    const firstRequest = wrapper.vm.forceAdd();
    await wrapper.vm.forceAdd();
    await wrapper.vm.$nextTick();

    expect(createFeed).toHaveBeenCalledOnce();
    expect(wrapper.get('.feed-cloudflare-warning button').attributes('disabled')).toBeDefined();

    deferred.resolve({ data: { feed: { id: 9, feedName: 'example.com' } } });
    await firstRequest;
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
    expect(store.overviewStore.addFeed).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Error force-adding feed');
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
    expect(store.overviewStore.addFeed).toHaveBeenCalledWith(3, persistedFeed);
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  it('saves accepted HTML/XPath metadata with the tested source rules', async () => {
    const persistedFeed = { id: 11, feedName: 'Saved webpage', feedType: 'html_xpath' };
    const sourceConfig = { item: '//article', itemTitle: './/h2' };
    createFeed.mockResolvedValue({ status: 201, data: { feed: persistedFeed } });
    const { store } = mountNewFeed();
    await wrapper.setData({
      selectedCategory: 3,
      crawlSince: '7d',
      feed: {
        feedName: 'Webpage feed',
        feedDesc: 'Publisher updates',
        feedType: 'html_xpath',
        url: 'https://example.com/news',
        sourceConfig
      }
    });

    await wrapper.vm.newFeed();

    expect(createFeed).toHaveBeenCalledWith({
      categoryId: 3,
      feedName: 'Webpage feed',
      feedDesc: 'Publisher updates',
      feedType: 'html_xpath',
      url: 'https://example.com/news',
      status: 'active',
      crawlSince: '7d',
      sourceConfig
    });
    expect(store.overviewStore.addFeed).toHaveBeenCalledWith(3, persistedFeed);
    expect(store.uiStore.setShowModal).toHaveBeenCalledWith('');
  });

  // Verifies repeated save actions cannot persist validated metadata twice.
  it('prevents duplicate validated-feed saves', async () => {
    const deferred = createDeferred();
    createFeed.mockReturnValue(deferred.promise);
    mountNewFeed();
    await wrapper.setData({
      selectedCategory: 3,
      feed: {
        feedName: 'Draft feed',
        feedDesc: '',
        feedType: 'rss',
        url: 'https://example.com/feed.xml'
      }
    });

    const firstRequest = wrapper.vm.newFeed();
    await wrapper.vm.newFeed();
    await wrapper.vm.$nextTick();

    expect(createFeed).toHaveBeenCalledOnce();
    expect(wrapper.get('.feed-modal-action.base-dialog__button--primary').attributes('disabled')).toBeDefined();

    deferred.resolve({
      status: 201,
      data: { feed: { id: 10, feedName: 'Saved feed' } }
    });
    await firstRequest;
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

    expect(store.overviewStore.addFeed).not.toHaveBeenCalled();
    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not add this feed. Please try again.',
      error
    );
  });
});
