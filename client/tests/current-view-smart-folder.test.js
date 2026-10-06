import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SaveCurrentViewSmartFolder from '../src/components/articles/SaveCurrentViewSmartFolder.vue';
import { currentViewSmartFolder, smartFolderRulePreview } from '../src/services/currentViewSmartFolder.js';
import { validateSmartFolderQuery } from '../src/services/queryValidation.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useOverviewStore } from '../src/store/overview.js';
import { fetchSmartFolders, fetchSmartFolderCounts, saveSmartFolders } from '../src/api/smartfolders.js';
vi.mock('../src/api/smartfolders.js', () => ({ fetchSmartFolders: vi.fn(), fetchSmartFolderCounts: vi.fn(), saveSmartFolders: vi.fn() }));
let wrapper, selection, overview;
const existing = { id: 7, name: 'Existing', query: 'unread:true', limitCount: 50, markAsReadOnScroll: true };
beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  selection = useSelectionStore(); overview = useOverviewStore();
  fetchSmartFolders.mockResolvedValue({ data: { smartFolders: [existing] } });
  fetchSmartFolderCounts.mockResolvedValue({ data: { smartFolders: [] } });
  saveSmartFolders.mockResolvedValue({ data: { smartFolders: [{ ...existing, id: 8 }, { id: 9, name: 'Saved', query: 'unread:true' }] } });
});
afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = ''; });
const render = () => { wrapper = mount(SaveCurrentViewSmartFolder, { attachTo: document.body, global: { stubs: { BootstrapIcon: true } } }); };
const button = text => wrapper.findAll('button').find(item => item.text() === text);
const open = async () => { await button('Save as smart folder').trigger('click'); await flushPromises(); };
describe('current view draft', () => {
  it('uses editor defaults and ignores unsupported navigation and layout while keeping supported grouping', () => {
    const draft = currentViewSmartFolder({ status: 'unread', categoryId: 3, feedId: 5, tag: 'AI', minOverallQualityScore: 80, minQualityScore: 90, minSentimentScore: 50, viewMode: 'summary', grouping: 'event', includeDevelopingEvents: true, ageCutoff: '7d', dateRange: 'custom', sort: 'recommended' });
    expect(draft.query).toBe('unread:true quality:>=0.80 sort:recommended grouping:event limit:50 tag:"AI"');
    expect(validateSmartFolderQuery(draft.query).valid).toBe(true);
    expect(draft.markAsReadOnScroll).toBe(false);
    expect(draft.name).toBe('AI · Unread');
  });
  it('preserves supported expressions and operators without turning unsupported filters into text', () => {
    const draft = currentViewSmartFolder({ status: 'all', search: 'author:"Ada Lovelace" language:nl quality:<0.80 event:false firstSeen:7d limit:100 sort:asc unsupported:true "Dutch news"' });
    expect(draft.query).toContain('author:"Ada Lovelace" language:nl quality:<0.80 event:false firstSeen:7d limit:100 sort:asc "Dutch news"');
    expect(draft.query).not.toContain('unsupported');
    expect(draft.limitCount).toBe(100);
    expect(smartFolderRulePreview(draft.query).map(rule => rule.label)).toEqual(['author: Ada Lovelace', 'language: nl', 'Quality < 80', 'Not Events', 'First seen within 7d', 'Oldest', 'Dutch news']);
  });
  it('maps calendar controls only when the editor has an equivalent date rule', () => {
    expect(currentViewSmartFolder({ status: 'unread' }, { dateRange: 'today' }).query).toContain('@today');
    expect(currentViewSmartFolder({ status: 'unread' }, { dateRange: 'yesterday' }).query).toContain('@yesterday');
    expect(currentViewSmartFolder({ status: 'read' }, { dateRange: 'today' }).query).not.toContain('@today');
    expect(currentViewSmartFolder({ status: 'unread' }, { dateRange: 'custom', ageCutoff: '7d' }).query).not.toMatch(/@|firstSeen:/);
  });
  it('keeps names concise', () => { expect(currentViewSmartFolder({ status: 'unread', search: 'a'.repeat(500) }).name.length).toBeLessThan(80); });
});
describe('save current view', () => {
  beforeEach(() => { selection.setSelectedSearch('title:news'); });
  it.each(['unread', 'favorite', 'hot', 'read', 'briefing', 'clicked'])('hides for the %s sidebar selection', async status => {
    render();
    selection.setSelectedStatus(status); await flushPromises();
    expect(button('Save as smart folder')).toBeUndefined();
  });
  it.each(['category', 'feed', 'tag', 'smart folder'])('hides for a selected %s', async context => {
    render();
    if (context === 'category') selection.selectCategory(3);
    if (context === 'feed') selection.selectFeed(5, 3);
    if (context === 'tag') selection.setTag('AI');
    if (context === 'smart folder') selection.setSmartFolder(existing);
    await flushPromises();
    expect(button('Save as smart folder')).toBeUndefined();
  });
  it.each([null, '', '   '])('hides without a nonblank search (%s)', async search => {
    render(); selection.setSelectedSearch(search); await flushPromises();
    expect(button('Save as smart folder')).toBeUndefined();
  });
  it.each(['news', 'title:news language:nl'])('shows for a user search (%s)', async search => {
    selection.setSelectedStatus('briefing'); render();
    expect(button('Save as smart folder')).toBeUndefined();
    selection.setSelectedSearch(search); await flushPromises();
    expect(button('Save as smart folder')).toBeDefined();
  });
  it.each(['category', 'feed', 'smart folder'])('shows when searching from a selected %s', async context => {
    if (context === 'category') selection.selectCategory(3);
    if (context === 'feed') selection.selectFeed(5, 3);
    if (context === 'smart folder') selection.setSmartFolder(existing);
    render(); selection.setSelectedSearch('title:news'); await flushPromises();
    expect(button('Save as smart folder')).toBeDefined();
  });
  it('prefills and selects the name and previews the persisted draft', async () => {
    selection.currentSelection.search = 'Verstappen language:nl'; render(); await open();
    expect(wrapper.get('input').element.value).toBe('Verstappen · Unread');
    expect(document.activeElement).toBe(wrapper.get('input').element);
    expect(wrapper.get('input').element.selectionEnd).toBe('Verstappen · Unread'.length);
    expect(wrapper.get('[role="dialog"]').text()).toContain('language: nl');
  });
  it('requires a nonblank name', async () => {
    render(); await open(); await wrapper.get('input').setValue('   '); expect(button('Save smart folder').element.disabled).toBe(true);
  });
  it('appends using the existing API, refreshes sidebar state and closes without navigating', async () => {
    render(); await open(); await wrapper.get('input').setValue('My folder');
    fetchSmartFolders.mockResolvedValueOnce({ data: { smartFolders: [existing] } }).mockResolvedValueOnce({ data: { smartFolders: [{ id: 9, name: 'My folder' }] } });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(saveSmartFolders).toHaveBeenCalledWith([{ ...existing, ArticleCount: 0 }, { name: 'My folder', query: 'unread:true sort:desc grouping:none limit:50 title:news', limitCount: 50, markAsReadOnScroll: false }]);
    expect(overview.smartFolders[0].name).toBe('My folder'); expect(fetchSmartFolders).toHaveBeenCalledTimes(2);
    expect(selection.currentSelection.smartFolderId).toBeNull(); expect(button('Save as smart folder').attributes('aria-expanded')).toBe('false');
  });
  it('retains the saved folder in sidebar state even if the refresh fails', async () => {
    fetchSmartFolders.mockResolvedValueOnce({ data: { smartFolders: [existing] } }).mockRejectedValueOnce(new Error('refresh failed'));
    render(); await open(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(overview.smartFolders.some(folder => folder.id === 9)).toBe(true);
    expect(button('Save as smart folder').attributes('aria-expanded')).toBe('false');
  });
  it('remaps an existing folder selected during the request when the bulk API replaces IDs', async () => {
    let finish; saveSmartFolders.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(); await open(); await wrapper.get('form').trigger('submit'); await flushPromises();
    selection.setSmartFolder(existing);
    finish({ data: { smartFolders: [{ ...existing, id: 8 }, { id: 9, name: 'Saved' }] } }); await flushPromises();
    expect(selection.currentSelection.smartFolderId).toBe(8);
  });
  it('surfaces API validation errors while keeping the draft open', async () => {
    saveSmartFolders.mockRejectedValue({ response: { status: 400, data: { error: { message: 'Invalid expression' } } } });
    render(); await open(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Invalid expression'); expect(button('Save as smart folder').attributes('aria-expanded')).toBe('true');
  });
  it('never replaces folders when loading the collection fails', async () => {
    fetchSmartFolders.mockRejectedValue(new Error('offline')); render(); await open(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(saveSmartFolders).not.toHaveBeenCalled(); expect(wrapper.get('[role="alert"]').text()).toContain('wasn’t saved');
  });
  it('prevents duplicate saves', async () => {
    let finish; saveSmartFolders.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(); await open(); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(button('Saving…').element.disabled).toBe(true); await wrapper.get('form').trigger('submit'); expect(saveSmartFolders).toHaveBeenCalledTimes(1);
    finish({ data: { smartFolders: [existing] } }); await flushPromises();
  });
  it('closes on Escape and restores focus', async () => {
    render(); await open(); await wrapper.get('input').trigger('keydown', { key: 'Escape' }); await flushPromises();
    expect(button('Save as smart folder').attributes('aria-expanded')).toBe('false'); expect(document.activeElement).toBe(button('Save as smart folder').element);
  });
  it('closes outside and cleans up listeners on unmount', async () => {
    render(); await open(); document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); await flushPromises();
    expect(button('Save as smart folder').attributes('aria-expanded')).toBe('false'); await open(); wrapper.unmount(); wrapper = null;
    expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).not.toThrow();
  });
  it('closes when selection changes', async () => {
    render(); await open(); selection.currentSelection.tag = 'AI'; await flushPromises(); expect(button('Save as smart folder').attributes('aria-expanded')).toBe('false');
  });
});
