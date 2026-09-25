import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import InterestInspector from '../src/components/interests/InterestInspector.vue';
import SettingsIslands from '../src/components/settings/SettingsIslands.vue';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import ArticleReaderLayout from '../src/components/articles/ArticleReaderLayout.vue';
import { articleFeedPaginationMethods } from '../src/components/articles/feed/pagination.js';
import { interestExplanation } from '../src/services/interestPresentation.js';
import api from '../src/api/client';

vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, setAuthToken: vi.fn() }));
const interest = { id: 1, name: 'Space', polarity: 'positive', lifecycle: 'active', evidenceStrength: 75,
  lastActivityAt: null, evidence: { favorites: 2, clicks: 4, deepReads: 0 }, representativeArticles: [] };
let wrapper;
let pinia;
const show = (value = interest, width = 1400) => {
  vi.stubGlobal('innerWidth', width);
  wrapper = mount(InterestInspector, { props: { interest: value }, attachTo: document.body, global: { plugins: [pinia] } });
  return wrapper;
};
beforeEach(() => { vi.clearAllMocks(); pinia = createPinia(); setActivePinia(pinia); api.get.mockResolvedValue({ data: { interest } }); });
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('interest explanation', () => {
  it.each([
    [{ favorites: 1 }, 'primarily from articles you favorited'],
    [{ clicks: 1 }, 'from your outbound article clicks'],
    [{ deepReads: 1 }, 'from sustained reading behavior'],
    [{ favorites: 1, clicks: 1 }, 'from your favorites and outbound clicks'],
    [{ favorites: 1, deepReads: 1 }, 'from your favorites and sustained reading behavior'],
    [{ clicks: 1, deepReads: 1 }, 'from outbound clicks and sustained reading behavior'],
    [{ favorites: 1, clicks: 1, deepReads: 1 }, 'from your favorites, outbound clicks, and sustained reading behavior'],
    [{}, 'breakdown is not available']
  ])('uses only present positive signals %j', (evidence, text) => {
    expect(interestExplanation({ polarity: 'positive', evidence })).toContain(text);
  });
  it('uses established negative polarity without inventing counts', () => {
    expect(interestExplanation({ polarity: 'negative' })).toBe('RSSMonster learned from your negative feedback that this subject is less relevant to you.');
    expect(interestExplanation({ polarity: 'neutral' })).toContain('neutral preference');
  });
});

describe('contextual inspector', () => {
  it('keeps desktop nonmodal, labels the panel, and compares raw counts without fabricating weights', async () => {
    show(); await flushPromises();
    expect(wrapper.get('aside').attributes('aria-labelledby')).toBe('interest-inspector-title');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.get('h2').text()).toBe('Space');
    expect(wrapper.get('.interest-badge--positive').text()).toBe('Positive');
    expect(wrapper.get('.interest-badge--active').text()).toBe('Active');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('75');
    expect(wrapper.text()).toContain('Last activity'); expect(wrapper.text()).toContain('Unknown');
    const rows = wrapper.findAll('.inspector-evidence-row');
    expect(rows.map(row => row.text())).toEqual(['Favorites2', 'Clicks4', 'Deep reads0']);
    expect(rows.map(row => row.get('.inspector-track > div').attributes('style'))).toEqual(['width: 50%;', 'width: 100%;', 'width: 0%;']);
    expect(wrapper.text()).toContain('not their scoring weights');
    expect(wrapper.find('svg, img, .base-dialog__title-icon, footer').exists()).toBe(false);
    await wrapper.get('[aria-label="Close interest details"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('renders negative raw weight without invented evidence', async () => {
    const negative = { id: 2, name: 'Celebrity', polarity: 'negative', lifecycle: 'archived', rawWeight: -.4, representativeArticles: [] };
    api.get.mockResolvedValue({ data: { interest: negative } });
    show(negative); await flushPromises();
    expect(wrapper.get('.interest-badge--negative').text()).toBe('Negative');
    expect(wrapper.text()).toContain('negative feedback');
    expect(wrapper.text()).toContain('-0.4');
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.find('.inspector-evidence-row').exists()).toBe(false);
    for (const label of ['Reads', 'Likes', 'Skipped', 'Hidden', 'Archive', 'Reactivate', 'Rename', 'Mute', 'Reset']) {
      expect(wrapper.findAll('button').some(button => button.text() === label)).toBe(false);
    }
  });

  it('renders examples with safe images and feedName and emits the clicked ID without writing read state', async () => {
    api.get.mockResolvedValue({ data: { interest: { ...interest, representativeArticles: [
      { id: 10, title: 'Moon', imageUrl: 'https://example.com/moon.jpg', publishedAt: '2026-09-01', feed: { feedName: 'Science' } },
      { id: 11, title: 'Mars', imageUrl: null, feed: { feedName: 'Space news' } }
    ] } } });
    show(); await flushPromises();
    expect(wrapper.findAll('.interest-example')).toHaveLength(2);
    expect(wrapper.get('img').attributes('src')).toBe('https://example.com/moon.jpg');
    expect(wrapper.findAll('.interest-example-image-empty')).toHaveLength(1);
    expect(wrapper.text()).toContain('Science');
    expect(wrapper.findAll('.interest-example-meta span').some(span => span.text().includes('ago'))).toBe(true);
    await wrapper.get('.interest-example').trigger('click');
    expect(wrapper.emitted('open-article')).toEqual([[10]]);
    expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
    await wrapper.get('img').trigger('error');
    expect(wrapper.findAll('.interest-example-image-empty')).toHaveLength(2);
  });

  it('switches selection without reloading the list and ignores late detail results', async () => {
    let resolve;
    api.get.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    show();
    expect(wrapper.get('[role="status"]').text()).toContain('Loading');
    api.get.mockResolvedValue({ data: { interest: { ...interest, id: 2, name: 'New selection' } } });
    await wrapper.setProps({ interest: { ...interest, id: 2, name: 'New selection' } }); await flushPromises();
    resolve({ data: { interest: { ...interest, name: 'Old response' } } }); await flushPromises();
    expect(wrapper.text()).not.toContain('Old response');
    expect(api.get.mock.calls.map(call => call[0])).toEqual(['/interests/1', '/interests/2']);
  });

  it('uses the existing mobile dialog focus trap, closes on Escape and restores focus', async () => {
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus();
    show(interest, 390); await flushPromises();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe('hidden');
    opener.remove();
  });

  it('retains list controls when closing and selecting a second interest', async () => {
    vi.stubGlobal('innerWidth', 1400);
    api.get.mockImplementation(async url => url === '/interests' ? { data: { interests: [interest, { ...interest, id: 2, name: 'Other' }], summary: { total: 2 } } } : { data: { interest } });
    wrapper = mount(SettingsIslands, { attachTo: document.body, global: { plugins: [pinia] } }); await flushPromises();
    await wrapper.get('select').setValue('name'); await flushPromises();
    const positive = wrapper.findAll('button').find(button => button.text() === 'Positive');
    await positive.trigger('click'); await flushPromises();
    const listCalls = api.get.mock.calls.filter(call => call[0] === '/interests').length;
    await wrapper.get('[aria-label="Inspect Space"]').trigger('click'); await flushPromises();
    await wrapper.get('[aria-label="Inspect Other"]').trigger('click'); await flushPromises();
    expect(wrapper.get('.interest-row--selected h3').text()).toBe('Other');
    await wrapper.get('[aria-label="Close interest details"]').trigger('click'); await flushPromises();
    expect(wrapper.get('select').element.value).toBe('name');
    expect(positive.attributes('aria-pressed')).toBe('true');
    expect(api.get.mock.calls.filter(call => call[0] === '/interests')).toHaveLength(listCalls);
  });
});

describe('example article reader integration', () => {
  it.each([true, false])('opens through the existing layout selection (Reader=%s) without marking an incidental selection read', async reader => {
    const selectArticle = vi.fn(); const selectArticleByIndex = vi.fn();
    api.post.mockResolvedValue({ data: [{ id: 9, title: 'Example', status: 'unread' }] });
    const context = { articles: [], activeReaderRecommendationRequestId: 0, activeRequestId: 1,
      selectionStore: { currentSelection: { sort: 'desc' } }, isReaderLayoutActive: reader,
      $nextTick: () => Promise.resolve(), $refs: { articleLayout: { selectArticle, selectArticleByIndex } } };
    context.loadReaderRecommendationArticle = id => articleFeedPaginationMethods.loadReaderRecommendationArticle.call(context, id);
    await ArticleFeed.methods.openExampleArticle.call(context, 9);
    expect(api.post).toHaveBeenCalledWith('/articles/details', { articleIds: '9', sort: 'desc' });
    if (reader) expect(selectArticle).toHaveBeenCalledWith(9, { markPreviousAsRead: false });
    else expect(selectArticleByIndex).toHaveBeenCalledWith(0);
    expect(api.put).not.toHaveBeenCalled();
    expect(context.articles[0].status).toBe('unread');
  });

  it('keeps a supplemental example visible when the reader collection is empty', () => {
    const context = { articles: [{ id: 9, readerRecommendationInd: true }], container: [], totalCount: 0,
      selectionStore: { currentSelection: { status: 'unread' } }, hasMore: false };
    expect(ArticleFeed.computed.readerCollectionProgress.call(context).isCollectionEmpty).toBe(false);
    expect(ArticleFeed.computed.streamCollectionProgress.call(context).isCollectionEmpty).toBe(false);
  });

  it('does not mark a transient initial Reader selection read', () => {
    const context = { selectedArticleId: 1, $emit: vi.fn(), $nextTick: vi.fn() };
    ArticleReaderLayout.methods.selectArticle.call(context, 9, { markPreviousAsRead: false });
    expect(context.selectedArticleId).toBe(9); expect(context.$emit).not.toHaveBeenCalled();
    ArticleReaderLayout.methods.selectArticle.call(context, 10);
    expect(context.$emit).toHaveBeenCalledWith('mark-previous-article-read', 9);
  });
});
