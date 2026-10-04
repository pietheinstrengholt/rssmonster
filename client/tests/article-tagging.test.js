import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ArticleTagDialog from '../src/components/articles/ArticleTagDialog.vue';
import ArticleActionsMenu from '../src/components/articles/ArticleActionsMenu.vue';
import Article from '../src/components/articles/Article.vue';
import api from '../src/api/client.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';

vi.mock('../src/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
let wrapper, pinia, overview, persisted, available, nextId;
const clone = value => JSON.parse(JSON.stringify(value));
const button = text => [...(document.querySelector('[role="dialog"]') || document).querySelectorAll('button')].find(element => element.textContent.trim() === text);
const checkbox = name => [...document.querySelectorAll('label')].find(element => element.textContent.trim() === name)?.querySelector('input');
const click = async element => { element.click(); await flushPromises(); };
const typeSearch = async text => {
  const input = document.querySelector('input[type="search"]');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
};
const search = async text => { await typeSearch(text); await vi.waitFor(() => expect(document.body.textContent).not.toContain('Searching…')); };
const removeChip = name => document.querySelector(`[aria-label="Remove tag ${name}"]`);
const render = async (mode = 'add') => {
  wrapper = mount(ArticleTagDialog, { attachTo: document.body, props: { articleId: 42, tags: clone(persisted), mode }, global: { plugins: [pinia] } });
  await flushPromises();
};

beforeEach(() => {
  vi.resetAllMocks();
  pinia = createPinia();
  setActivePinia(pinia);
  overview = useOverviewStore();
  overview.topTags = [{ name: 'news', count: 5 }];
  persisted = [{ id: 10, name: 'existing', tagType: 'rule' }, { id: 11, name: 'old', tagType: 'manual' }];
  available = ['existing', 'news', 'old', 'sports'];
  nextId = 12;
  api.get.mockImplementation(async (url, config) => {
    if (url === '/articles/42') return { data: { article: { id: 42, tags: clone(persisted) } } };
    if (url === '/tags' && config?.params?.scope === 'all') {
      const { limit, offset = 0, search = '' } = config.params;
      const names = available.filter(name => name.includes(search)).sort((a, b) => Number(b === search) - Number(a === search) || a.localeCompare(b));
      return { data: { tags: names.slice(offset, offset + limit).map(name => ({ name })), hasMore: names.length > offset + limit } };
    }
    if (url === '/tags') return { data: { tags: [{ name: 'news', count: persisted.some(tag => tag.name === 'news') ? 1 : 0 }] } };
    if (url === '/smartfolders/counts') return { data: { smartFolders: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  api.post.mockImplementation(async (url, body) => {
    expect(url).toBe('/articles/42/tags');
    for (const name of body.tags) if (!persisted.some(tag => tag.name === name)) persisted.push({ id: nextId++, name, tagType: 'manual' });
    return { data: { tags: clone(persisted) } };
  });
  api.delete.mockImplementation(async url => {
    const id = Number(url.split('/').at(-1));
    persisted = persisted.filter(tag => tag.id !== id);
    return { data: { tags: clone(persisted) } };
  });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => {
  wrapper?.unmount(); wrapper = null;
  overview.resetSessionState();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('article tagging dialog', () => {
  const orderedNames = () => [...document.querySelectorAll('label')].filter(label => label.querySelector('input[type="checkbox"]')).map(label => label.textContent.trim());

  it.each(['add', 'manage'])('orders selected search matches first in %s mode', async mode => {
    await render(mode); await search('s');
    expect(orderedNames()).toEqual(['Existing', 'News', 'Sports']);
    await click(checkbox('Sports'));
    expect(orderedNames()).toEqual(['Existing', 'Sports', 'News']);
    await click(checkbox('News'));
    expect(orderedNames()).toEqual(['Existing', 'News', 'Sports']);
    await click(checkbox('Sports'));
    expect(checkbox('Sports').checked).toBe(false);
  });

  it('moves deselected matching current tags below selected tags in Manage mode', async () => {
    await render('manage'); await search('s');
    await click(checkbox('Existing'));
    expect(orderedNames()).toEqual(['Existing', 'News', 'Sports']);
    expect(checkbox('Existing').checked).toBe(false);
    await click(checkbox('Sports'));
    expect(orderedNames()).toEqual(['Sports', 'Existing', 'News']);
    await click(checkbox('Existing'));
    expect(orderedNames()).toEqual(['Existing', 'Sports', 'News']);
  });

  it('only sorts matching search results with selected matches first', async () => {
    available.push('alpha news', 'old news');
    persisted.push({ id: nextId++, name: 'old news', tagType: 'manual' });
    await render('manage'); await search(' NEWS ');
    expect(orderedNames()).toEqual(['Old news', 'Alpha news', 'News']);
    expect(checkbox('Existing')).toBeUndefined();
    await click(checkbox('News'));
    expect(orderedNames()).toEqual(['News', 'Old news', 'Alpha news']);
  });

  it('toggles tags through the labelled row and preserves checked state after reordering', async () => {
    await render('manage'); await search('s');
    await click(checkbox('Sports').closest('label'));
    expect(checkbox('Sports').checked).toBe(true);
    expect(orderedNames()).toEqual(['Existing', 'Sports', 'News']);
    await click(checkbox('Sports').closest('label'));
    expect(checkbox('Sports').checked).toBe(false);
    expect(orderedNames()).toEqual(['Existing', 'News', 'Sports']);
  });

  it('returns keyboard focus to search when a selected default moves into chips', async () => {
    await render('manage');
    checkbox('Sports').focus();
    await click(checkbox('Sports'));
    expect(removeChip('Sports')).not.toBeNull();
    expect(checkbox('Sports')).toBeUndefined();
    expect(document.activeElement).toBe(document.querySelector('input[type="search"]'));
  });

  it('preselects current tags, prevents their removal in Add mode, and requires a new selection', async () => {
    await render();
    expect(document.querySelector('[aria-label="Tag Existing already assigned"]').disabled).toBe(true);
    await search('existing');
    expect(checkbox('Existing').checked).toBe(true);
    expect(checkbox('Existing').disabled).toBe(true);
    expect(document.querySelector('[aria-label="Tag Old already assigned"]').disabled).toBe(true);
    expect(button('Add tags').disabled).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('input[type="search"]'));
    await click(checkbox('Existing'));
    expect(checkbox('Existing').checked).toBe(true);
  });

  it('only adds newly selected tags and returns immediately updated article tags', async () => {
    await render();
    await click(checkbox('Sports'));
    await click(button('Add tags'));
    expect(api.post).toHaveBeenCalledWith('/articles/42/tags', { tags: ['sports'] }, expect.any(Object));
    expect(api.delete).not.toHaveBeenCalled();
    expect(persisted.map(tag => tag.name)).toEqual(['existing', 'old', 'sports']);
    expect(wrapper.emitted('updated').at(-1)[0]).toEqual(persisted);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('saves additions and removals from Manage in one action', async () => {
    await render('manage');
    const chip = document.querySelector('[aria-label="Remove tag Old"]');
    await click(chip);
    expect(checkbox('Old').checked).toBe(false);
    await click(checkbox('Sports'));
    await click(button('Save changes'));
    expect(persisted.map(tag => tag.name)).toEqual(['existing', 'sports']);
    expect(api.delete).toHaveBeenCalledWith('/articles/42/tags/11', expect.any(Object));
    expect(wrapper.emitted('updated').at(-1)[0]).toEqual(persisted);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('supports checkbox removal and removing all assignments', async () => {
    await render('manage');
    await search('existing'); await click(checkbox('Existing'));
    await search('old'); await click(checkbox('Old'));
    await click(button('Save changes'));
    expect(persisted).toEqual([]);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('searches normalized names on the server with bounded results', async () => {
    await render();
    await search(' SPoRt ');
    expect(checkbox('Sports')).toBeDefined();
    expect(checkbox('News')).toBeUndefined();
    expect(api.get.mock.calls.filter(([url, config]) => url === '/tags' && config.params.scope === 'all')).toHaveLength(2);
    await search('missing');
    expect(document.body.textContent).toContain('No matching tags found.');
  });

  it.each(['add', 'manage'])('reuses cached popularity without duplicate defaults in %s mode', async mode => {
    await render(mode);
    expect(document.body.textContent).toContain('Most used in this view');
    expect(orderedNames()).toEqual(['News', 'Sports']);
    expect(api.get.mock.calls.filter(([url, config]) => url === '/tags' && !config?.params?.scope)).toHaveLength(0);
  });

  it('loads only ten defaults with 10,000 names and searches beyond them', async () => {
    available = Array.from({ length: 10000 }, (_, index) => `topic-${String(index).padStart(5, '0')}`);
    await render();
    expect(orderedNames()).toHaveLength(11);
    expect(api.get.mock.calls.filter(([url, config]) => url === '/tags' && config.params.scope === 'all')).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith('/tags', expect.objectContaining({ params: { scope: 'all', limit: 10 } }));
    await search('topic-09999');
    expect(orderedNames()).toEqual(['Topic-09999']);
    expect(api.get).toHaveBeenCalledWith('/tags', expect.objectContaining({ params: { scope: 'all', search: 'topic-09999', limit: 20 } }));
  });

  it('shows current chips immediately while suggestions and current tags load', async () => {
    api.get.mockImplementation(() => new Promise(() => {}));
    await render('manage');
    expect(removeChip('Existing')).not.toBeNull();
    expect(removeChip('Old')).not.toBeNull();
    expect(document.body.textContent).toContain('Loading suggestions…');
  });

  it('debounces rapid input and restores defaults without refetching when cleared', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await render();
    await typeSearch('n'); await vi.advanceTimersByTimeAsync(200);
    await typeSearch('news'); await vi.advanceTimersByTimeAsync(249);
    expect(api.get.mock.calls.filter(([, config]) => config?.params?.search)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1); await flushPromises();
    expect(orderedNames()).toEqual(['News']);
    expect(api.get.mock.calls.filter(([, config]) => config?.params?.search)).toHaveLength(1);
    await typeSearch('');
    expect(orderedNames()).toEqual(['News', 'Sports']);
    expect(api.get.mock.calls.filter(([, config]) => config?.params?.scope)).toHaveLength(2);
  });

  it('ignores an older response even when cancellation cannot stop it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await render();
    const requests = [];
    api.get.mockImplementation((url, config) => new Promise(resolve => requests.push({ resolve, signal: config.signal })));
    await typeSearch('a'); await vi.advanceTimersByTimeAsync(250);
    await typeSearch('ai'); await vi.advanceTimersByTimeAsync(250);
    expect(requests[0].signal.aborted).toBe(true);
    requests[1].resolve({ data: { tags: [{ name: 'ai' }] } }); await flushPromises();
    requests[0].resolve({ data: { tags: [{ name: 'stale' }] } }); await flushPromises();
    expect(orderedNames()).toEqual(['Ai']);
    wrapper.unmount(); wrapper = null;
    expect(requests[1].signal.aborted).toBe(true);
  });

  it('offers inline creation only without a normalized exact match', async () => {
    await render(); await search(' NEWS ');
    expect(button('Create "news"')).toBeUndefined();
    await search('new research');
    expect(document.body.textContent).toContain('No matching tags found.');
    await click(button('Create "new research"'));
    expect(removeChip('New research')).not.toBeNull();
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(api.post).not.toHaveBeenCalled();
    await click(button('Add tags'));
    expect(persisted.some(tag => tag.name === 'new research')).toBe(true);
  });

  it('retries failed searches without losing current selections', async () => {
    await render('manage');
    api.get.mockRejectedValueOnce(new Error('offline'));
    await search('sports');
    expect(document.body.textContent).toContain('Could not search tags.');
    expect(removeChip('Existing')).not.toBeNull();
    expect(button('Create "sports"')).toBeUndefined();
    await click(button('Retry'));
    await vi.waitFor(() => expect(checkbox('Sports')).toBeDefined());
  });

  it('keeps current tags editable when suggestions fail', async () => {
    const get = api.get.getMockImplementation();
    api.get.mockImplementation((url, config) => config?.params?.scope ? Promise.reject(new Error('offline')) : get(url, config));
    await render('manage');
    expect(document.body.textContent).toContain('Could not load suggestions.');
    await click(removeChip('Old')); await click(button('Save changes'));
    expect(persisted.map(tag => tag.name)).toEqual(['existing']);
  });

  it('creates and selects a normalized draft tag inline and persists it on save', async () => {
    await render();
    await search(' Research ');
    await click(button('Create new tag'));
    expect(document.activeElement).toBe(document.querySelector('form input'));
    await click(button('Create'));
    expect(removeChip('Research')).not.toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toBeUndefined();
    await click(button('Add tags'));
    expect(persisted.some(tag => tag.name === 'research' && tag.tagType === 'manual')).toBe(true);
  });

  it('selects an existing normalized name instead of creating duplicates', async () => {
    await render();
    await search(' NEWS ');
    await click(button('Create new tag'));
    await click(button('Create'));
    expect(removeChip('News')).not.toBeNull();
    await click(button('Add tags'));
    expect(persisted.filter(tag => tag.name === 'news')).toHaveLength(1);
  });

  it('does not persist new draft tags when cancelled', async () => {
    await render();
    await search('draft'); await click(button('Create new tag')); await click(button('Create'));
    await click(button('Cancel'));
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('shows loading and supports retry after a catalogue error', async () => {
    let finish;
    api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    wrapper = mount(ArticleTagDialog, { attachTo: document.body, props: { articleId: 42 }, global: { plugins: [pinia] } });
    await flushPromises();
    expect(document.body.textContent).toContain('Loading current tags…');
    expect(button('Add tags').disabled).toBe(true);
    finish({ data: { article: { tags: clone(persisted) } } }); await flushPromises();
    wrapper.unmount(); wrapper = null;
    api.get.mockRejectedValueOnce(new Error('unavailable'));
    await render();
    expect(document.querySelector('[role="alert"]').textContent).toContain('Could not load');
    await click(button('Retry current tags'));
    expect(document.querySelector('[aria-label="Tag Existing already assigned"]')).not.toBeNull();
  });

  it('prevents repeat saves and closing while a mutation is pending', async () => {
    let finish;
    api.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await render(); await click(checkbox('News')); await click(button('Add tags'));
    expect(button('Saving…').disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(true);
    await click(button('Saving…'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(api.post).toHaveBeenCalledTimes(1);
    finish({ data: { tags: clone(persisted) } }); await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('keeps draft selections after an API error and announces the failure', async () => {
    const notifications = [];
    const listener = event => notifications.push(event.detail.message);
    window.addEventListener('app:action-error', listener);
    try {
      api.post.mockRejectedValueOnce({ response: { status: 400 } });
      await render(); await click(checkbox('News')); await click(button('Add tags'));
      expect(document.querySelector('[role="alert"]').textContent).toContain('Could not save all');
      expect(removeChip('News')).not.toBeNull();
      expect(button('Add tags').disabled).toBe(false);
      expect(wrapper.emitted('close')).toBeUndefined();
      expect(notifications).toHaveLength(1);
    } finally { window.removeEventListener('app:action-error', listener); }
  });

  it('retries only remaining changes after a partial save', async () => {
    api.delete.mockRejectedValueOnce({ response: { status: 500 } });
    await render('manage'); await click(removeChip('Old')); await click(checkbox('News')); await click(button('Save changes'));
    expect(persisted.map(tag => tag.name)).toEqual(['existing', 'old', 'news']);
    expect(wrapper.emitted('updated').at(-1)[0]).toEqual(persisted);
    await click(button('Save changes'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(persisted.map(tag => tag.name)).toEqual(['existing', 'news']);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('finishes a save when a lost response is reconciled to the desired state', async () => {
    api.post.mockImplementationOnce(async (url, body) => {
      persisted.push({ id: nextId++, name: body.tags[0], tagType: 'manual' });
      throw new Error('Response lost after commit');
    });
    await render(); await click(checkbox('News')); await click(button('Add tags'));
    expect(wrapper.emitted('updated').at(-1)[0]).toEqual(persisted);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('finishes removal when another request already deleted the association', async () => {
    api.delete.mockImplementationOnce(async () => {
      persisted = persisted.filter(tag => tag.name !== 'old');
      throw { response: { status: 404 } };
    });
    await render('manage'); await click(removeChip('Old')); await click(button('Save changes'));
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('updated').at(-1)[0].map(tag => tag.name)).toEqual(['existing']);
  });

  it('rejects empty and overly long names after normalization', async () => {
    await render(); await click(button('Create new tag'));
    const input = document.querySelector('form input');
    input.value = '   '; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises();
    expect(button('Create').disabled).toBe(true);
    input.value = '\u0130'.repeat(255); input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises();
    await click(button('Create'));
    expect(document.querySelector('[role="alert"]').textContent).toContain('up to 255 characters');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('traps Tab, closes on Escape, and restores the opener', async () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    await render(); await click(checkbox('News'));
    button('Add tags').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement.getAttribute('aria-label')).toBe('Close dialog');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(button('Add tags'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount(); wrapper = null;
    expect(document.activeElement).toBe(opener);
  });
});

describe('article tagging integration', () => {
  it.each(['full', 'minimal', 'reader'])('disables unsupported tagging on expanded duplicate articles in %s mode', async mode => {
    useSelectionStore().currentSelection.viewMode = mode;
    wrapper = mount(Article, { attachTo: document.body, props: { id: 42, duplicateOfArticleId: 41, title: 'Duplicate', readerDetail: mode === 'reader' }, global: { plugins: [pinia] } });
    await click(document.querySelector('[aria-label="Article actions"]'));
    expect(button('Add tags').disabled).toBe(true);
    expect(button('Manage tags').disabled).toBe(true);
    expect(button('Add tags').title).toContain('original article');
    await click(button('Add tags'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('refreshes sidebar state once for a Manage save without reloading the article list', async () => {
    wrapper = mount(Article, { attachTo: document.body, props: { id: 42, tags: clone(persisted), title: 'Article' }, global: { plugins: [pinia] } });
    await click(document.querySelector('[aria-label="Article actions"]')); await click(button('Manage tags'));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    await flushPromises();
    await click(removeChip('Existing')); await click(removeChip('Old')); await click(checkbox('News')); await click(button('Save changes'));
    expect(wrapper.emitted('update-tags')).toHaveLength(1);
    expect(persisted.map(tag => tag.name)).toEqual(['news']);
    expect(api.get.mock.calls.filter(([url, config]) => url === '/tags' && !config?.params?.scope)).toHaveLength(1);
    expect(api.get.mock.calls.some(([url]) => url === '/articles')).toBe(false);
  });
  it('places Add and Manage between state and personalization actions', async () => {
    wrapper = mount(ArticleActionsMenu, { attachTo: document.body });
    await click(document.querySelector('[aria-label="Article actions"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim())).toEqual([
      'Save article', 'Mark original as opened', 'Mark as read', 'Add tags', 'Manage tags', 'More like this', 'Not Interested', 'Mute Feed for 7 Days'
    ]);
  });

  it.each(['full', 'minimal', 'reader'])('opens both workflows and updates visible chips in %s mode', async mode => {
    useSelectionStore().currentSelection.viewMode = mode;
    wrapper = mount(Article, {
      attachTo: document.body,
      props: { id: 42, tags: clone(persisted), status: 'unread', title: 'Article', readerDetail: mode === 'reader', feed: { feedName: 'Source' } },
      global: { plugins: [pinia] }
    });
    const trigger = document.querySelector('[aria-label="Article actions"]');
    await click(trigger); await click(button('Add tags'));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    await flushPromises(); await click(checkbox('Sports')); await click(button('Add tags'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[aria-label="Filter articles by tag Sports"]')).not.toBeNull();
    expect(wrapper.emitted('update-tags').at(-1)[0].tags).toEqual(persisted);
    expect(document.activeElement).toBe(trigger);
    expect(overview.topTags).toEqual([{ name: 'news', count: 0 }]);
    await click(trigger); await click(button('Manage tags')); await flushPromises();
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Manage tags');
    expect(removeChip('Sports')).not.toBeNull();
    await click(document.querySelector('[aria-label="Remove tag Sports"]')); await click(button('Save changes'));
    expect(document.querySelector('[aria-label="Filter articles by tag Sports"]')).toBeNull();
  });

  it('renders newly assigned manual tags in mobile metadata', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    useSelectionStore().currentSelection.viewMode = 'minimal';
    wrapper = mount(Article, { attachTo: document.body, props: { id: 42, tags: clone(persisted), title: 'Mobile article' }, global: { plugins: [pinia] } });
    await click(document.querySelector('[aria-label="Article actions"]')); await click(button('Add tags'));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    await flushPromises(); await click(checkbox('News')); await click(button('Add tags'));
    expect(document.querySelector('[aria-label="Filter articles by tag News"]')).not.toBeNull();
  });
});
