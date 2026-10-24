import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { offlineReading, offlineAccount } from '../src/services/offlineReading.js';
import { useOfflineReadingStore } from '../src/store/offlineReading.js';
import { useSelectionStore } from '../src/store/selection.js';
import { createPinia, setActivePinia } from 'pinia';
import api, { setOfflineReadOnly } from '../src/api/client.js';
import { articleStateActions } from '../src/services/articleStateActions.js';
import { OFFLINE_STATE_EVENT } from '../src/services/offlineCoordination.js';
import { ACTION_ERROR_EVENT } from '../src/services/actionNotifications.js';
import { createActionErrorDiagnostics } from '../src/services/actionErrorDiagnostics.js';

let pinia;
let wrapper;
const dto = {
  id: 41, title: 'Downloaded article', publishedAt: '2026-10-01T12:00:00Z',
  content: '<p>The full downloaded article body.</p>', contentText: 'The full downloaded article body.',
  status: 'unread', savedInd: 1, feedId: 2, feed: { id: 2, name: 'Example feed' },
  tags: []
};
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const store = useOfflineReadingStore();
  store.account = offlineAccount(1);
  store.profile = { enabled: true, activeGeneration: 'ready' };
  store.setReadOnly(true);
  useSelectionStore().currentSelection.viewMode = 'expanded';
  vi.spyOn(offlineReading, 'loadSnapshot').mockResolvedValue([dto]);
});
afterEach(() => {
  wrapper?.unmount();
  setOfflineReadOnly(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloaded article rendering', () => {
  it('hydrates the existing feed and article renderer without fetching article bodies', async () => {
    const requests = vi.spyOn(api, 'get');
    wrapper = mount(ArticleFeed, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Downloaded articles');
    expect(wrapper.text()).toContain('Downloaded article');
    expect(wrapper.text()).toContain('The full downloaded article body.');
    expect(requests).not.toHaveBeenCalled();
    expect(offlineReading.loadSnapshot).toHaveBeenCalledWith(offlineAccount(1));
  });
  it('keeps snapshot read/saved state when an offline action is attempted', async () => {
    const adapter = vi.fn();
    const originalAdapter = api.defaults.adapter;
    api.defaults.adapter = adapter;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      wrapper = mount(ArticleFeed, { global: { plugins: [pinia] } });
      await flushPromises();
      const actions = wrapper.findAll('button').find(item => item.attributes('aria-label') === 'Article actions');
      await actions.trigger('click');
      const save = wrapper.findAll('button').find(item => item.text() === 'Remove from saved');
      await save.trigger('click');
      await flushPromises();
      expect(adapter).not.toHaveBeenCalled();
      expect(wrapper.findAll('button').some(item => item.text() === 'Remove from saved')).toBe(true);
    } finally { api.defaults.adapter = originalAdapter; }
  });
  it('removes the displayed library after Clear offline data', async () => {
    wrapper = mount(ArticleFeed, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.text()).toContain('The full downloaded article body.');
    offlineReading.loadSnapshot.mockResolvedValue([]);
    vi.spyOn(offlineReading, 'clearSnapshot').mockResolvedValue();
    await useOfflineReadingStore().clearSnapshot();
    await flushPromises();
    expect(wrapper.text()).not.toContain('The full downloaded article body.');
  });
});

describe('article reconciliation across page suspension', () => {
  let visibility;
  const changeVisibility = state => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const publish = details => window.dispatchEvent(new CustomEvent(OFFLINE_STATE_EVENT, {
    detail: { account: offlineAccount(1), ...details }
  }));
  const render = async () => {
    wrapper = mount(ArticleFeed, { global: { plugins: [pinia] } });
    await flushPromises();
  };
  beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });

  it('retains every server patch while hidden and applies them in order on return', async () => {
    const overlay = vi.spyOn(articleStateActions, 'overlay').mockImplementation(async articles => articles);
    await render();
    changeVisibility('hidden');
    publish({ articles: [{ id: 41, title: 'First patch', content: '<p>Updated article body.</p>', contentText: 'Updated article body.' }] });
    publish({ articles: [{ id: 41, title: 'Latest patch' }] });
    await flushPromises();
    expect(overlay).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Downloaded article');
    changeVisibility('visible');
    await flushPromises();
    expect(wrapper.text()).toContain('Latest patch');
    expect(wrapper.text()).toContain('Updated article body.');
  });

  it('retains an interrupted patch without showing an error while hidden', async () => {
    let fail;
    const overlay = vi.spyOn(articleStateActions, 'overlay')
      .mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; }))
      .mockImplementation(async articles => articles);
    const errors = vi.fn();
    window.addEventListener(ACTION_ERROR_EVENT, errors);
    try {
      await render();
      publish({ articles: [{ id: 41, title: 'Recovered article' }] });
      expect(overlay).toHaveBeenCalledOnce();
      changeVisibility('hidden');
      fail(new Error('Offline storage transaction aborted.'));
      await flushPromises();
      expect(errors).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('Downloaded article');
      changeVisibility('visible');
      await flushPromises();
      expect(wrapper.text()).toContain('Recovered article');
      expect(errors).not.toHaveBeenCalled();
      const report = JSON.parse(createActionErrorDiagnostics('Recovery history', null));
      expect(report.recentOfflineEvents).toContainEqual(expect.objectContaining({
        event: 'reconciliation-failed', attempt: 1, visibilityAtStart: 'visible', visibility: 'hidden'
      }));
      expect(report.recentOfflineEvents).toContainEqual(expect.objectContaining({
        event: 'reconciliation-complete', attempt: 2, deferred: true, visibility: 'visible'
      }));
    } finally {
      window.removeEventListener(ACTION_ERROR_EVENT, errors);
    }
  });

  it('does not apply deferred patches from an earlier account session', async () => {
    const overlay = vi.spyOn(articleStateActions, 'overlay').mockImplementation(async articles => articles);
    await render();
    changeVisibility('hidden');
    publish({ articles: [{ id: 41, title: 'Old account patch' }] });
    useOfflineReadingStore().sessionId++;
    changeVisibility('visible');
    await flushPromises();
    expect(overlay).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Downloaded article');
    expect(wrapper.text()).not.toContain('Old account patch');
  });

  it('finishes an earlier overlay before applying a newer notification', async () => {
    let finish;
    const overlay = vi.spyOn(articleStateActions, 'overlay')
      .mockImplementationOnce(articles => new Promise(resolve => { finish = () => resolve(articles); }))
      .mockImplementation(async articles => articles);
    await render();
    publish({ articles: [{ id: 41, title: 'Earlier title', content: '<p>Earlier body update.</p>' }] });
    publish({ articles: [{ id: 41, title: 'Latest title' }] });
    expect(overlay).toHaveBeenCalledOnce();
    finish();
    await flushPromises();
    expect(wrapper.text()).toContain('Latest title');
    expect(wrapper.text()).toContain('Earlier body update.');
  });

  it('still reports a reconciliation failure when the page is visible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(articleStateActions, 'overlay').mockRejectedValue(new Error('Offline storage transaction aborted.'));
    const errors = vi.fn();
    window.addEventListener(ACTION_ERROR_EVENT, errors);
    try {
      await render();
      publish({ articles: [{ id: 41, title: 'Failed patch' }] });
      await flushPromises();
      expect(errors).toHaveBeenCalledOnce();
      expect(errors.mock.calls[0][0].detail.message).toBe('Could not reconcile local article changes.');
      expect(wrapper.text()).toContain('Downloaded article');
    } finally {
      window.removeEventListener(ACTION_ERROR_EVENT, errors);
    }
  });

  it('does not apply deferred patches to a replacement collection', async () => {
    vi.spyOn(articleStateActions, 'overlay').mockImplementation(async articles => articles);
    await render();
    changeVisibility('hidden');
    publish({ articles: [{ id: 41, title: 'Old collection patch' }] });
    useSelectionStore().setCurrentSelection({ feedId: 2 });
    await flushPromises();
    changeVisibility('visible');
    await flushPromises();
    expect(wrapper.text()).toContain('Downloaded article');
    expect(wrapper.text()).not.toContain('Old collection patch');
  });

  it('defers discarded-action snapshot reads until the page is visible', async () => {
    await render();
    offlineReading.loadSnapshot.mockClear();
    changeVisibility('hidden');
    publish({ discarded: true, discardedActions: [] });
    await flushPromises();
    expect(offlineReading.loadSnapshot).not.toHaveBeenCalled();
    changeVisibility('visible');
    await flushPromises();
    expect(offlineReading.loadSnapshot).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Downloaded article');
  });

  it('does not resume queued reads after the feed is unmounted', async () => {
    const overlay = vi.spyOn(articleStateActions, 'overlay').mockImplementation(async articles => articles);
    await render();
    changeVisibility('hidden');
    publish({ articles: [{ id: 41, title: 'Unmounted patch' }] });
    wrapper.unmount();
    wrapper = null;
    changeVisibility('visible');
    await flushPromises();
    expect(overlay).not.toHaveBeenCalled();
  });
});
