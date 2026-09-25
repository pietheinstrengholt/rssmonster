import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsIslands from '../src/components/settings/SettingsIslands.vue';
import Settings from '../src/components/settings/Settings.vue';
import AppShell from '../src/AppShell.vue';
import Sidebar from '../src/components/sidebar/Sidebar.vue';
import { useUiStore } from '../src/store/ui.js';
import { useSelectionStore } from '../src/store/selection.js';
import api from '../src/api/client';

vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn() }, setAuthToken: vi.fn(), CONNECTIVITY_ERROR_EVENT: 'app:connectivity-error' }));
const positive = { id: 1, name: 'Space exploration', polarity: 'positive', weight: .75, evidenceStrength: 75,
  lifecycle: 'active', lastActivityAt: '2026-09-01T10:00:00Z', evidence: { favorites: 2, clicks: 4, deepReads: 1 } };
const negative = { id: 2, name: 'Celebrity coverage', polarity: 'negative', weight: -.4, evidenceStrength: 40,
  lifecycle: 'archived', lastActivityAt: null, evidence: { negativeFeedback: 3 } };
const summary = { total: 2, positive: 1, negative: 1, neutral: 0, active: 1, archived: 1 };
const result = (interests = [positive, negative], counts = summary) => ({ data: { interests, summary: counts } });
let wrappers;
let pinia;
const render = (component, props = {}) => {
  const wrapper = mount(component, { props, attachTo: document.body, global: { plugins: [pinia], stubs: { BootstrapIcon: true } } });
  wrappers.push(wrapper);
  return wrapper;
};
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text().trim() === text);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  pinia = createPinia(); setActivePinia(pinia); wrappers = [];
  api.get.mockResolvedValue(result());
  api.patch.mockResolvedValue({ data: { interest: { ...positive, muted: true } } });
});
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('Settings Islands interests', () => {
  it('selects Active and requests active islands on opening', async () => {
    const wrapper = render(SettingsIslands); await flushPromises();
    expect(button(wrapper, 'Active').attributes('aria-pressed')).toBe('true');
    expect(button(wrapper, 'All').attributes('aria-pressed')).toBe('false');
    expect(api.get).toHaveBeenCalledWith('/interests', expect.objectContaining({
      params: { search: '', polarity: 'all', lifecycle: 'active', sort: 'strength' }
    }));
  });

  it('renders heading, API labels, signed evidence and accessible normalized strength without decorative icons', async () => {
    const wrapper = render(SettingsIslands); await flushPromises();
    expect(wrapper.get('.settings-insight-card').text()).toContain('Your evolving interests');
    expect(wrapper.text()).toContain('Interest islands capture the interests');
    for (const label of ['Positive interests', 'Negative interests', 'Active', 'Archived']) expect(wrapper.text()).toContain(label);
    expect(wrapper.findAll('.interest-summary-card')).toHaveLength(4);
    expect(wrapper.findAll('.interest-summary-card').map(card => card.get('strong').text())).toEqual(['1', '1', '1', '1']);
    expect(wrapper.text()).not.toContain('Why this island exists');
    expect(wrapper.text()).not.toContain('Recalculate Islands');
    const rows = wrapper.findAll('.interest-row');
    expect(rows[0].text()).toContain('Space exploration');
    expect(rows[0].text()).toContain('Positive');
    expect(rows[0].text()).toContain('Favorites 2');
    expect(rows[0].text()).toContain('Clicks 4');
    expect(rows[0].text()).toContain('Deep reads 1');
    expect(rows[0].text()).toContain('Active');
    expect(rows[0].get('[role="progressbar"]').attributes()).toMatchObject({ 'aria-valuenow': '75', 'aria-valuemin': '0', 'aria-valuemax': '100' });
    expect(rows[1].text()).toContain('Negative feedback 3');
    expect(rows[1].text()).toContain('Archived');
    expect(rows[1].text()).toContain('Unknown');
    expect(rows[1].find('.interest-strength-fill--negative').exists()).toBe(true);
    for (const row of rows) expect(row.find('svg, img, bootstrap-icon-stub').exists()).toBe(false);
    for (const label of ['Reads', 'Likes', 'Dislikes', 'Skipped', 'Hidden', 'Dormant', 'Reactivated', 'Topics']) expect(wrapper.text()).not.toContain(label);
  });

  it('renders neutral and raw weight without manufacturing a progress bar or evidence', async () => {
    api.get.mockResolvedValue(result([{ id: 3, name: 'Neutral', polarity: 'neutral', rawWeight: 0, lifecycle: 'archived' }]));
    const wrapper = render(SettingsIslands); await flushPromises();
    expect(wrapper.get('.interest-badge--neutral').text()).toBe('Neutral');
    expect(wrapper.get('.interest-strength-header strong').text()).toBe('0');
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.find('.interest-evidence').exists()).toBe(false);
  });

  it('shows loading, the first-use empty state and a distinct filtered empty state', async () => {
    const pending = deferred(); api.get.mockReturnValueOnce(pending.promise);
    const wrapper = render(SettingsIslands);
    expect(wrapper.get('[role="status"]').text()).toContain('Loading interests');
    pending.resolve(result([], { ...summary, total: 0 })); await flushPromises();
    expect(wrapper.text()).toContain('No interests learned yet');
    expect(wrapper.text()).toContain('RSSMonster learns from favorites, feedback, outbound clicks, and meaningful reading behavior.');
    api.get.mockResolvedValue(result([]));
    await button(wrapper, 'Negative').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('No matching interests');
    expect(wrapper.text()).not.toContain('No interests learned yet');
  });

  it('offers retry after API failure', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    const wrapper = render(SettingsIslands); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('couldn’t load your interests');
    await button(wrapper, 'Try again').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('.interest-row')).toHaveLength(2);
  });

  it('debounces search, sends filters and sorting to the API, and ignores obsolete responses', async () => {
    vi.useFakeTimers();
    const pending = deferred(); api.get.mockReturnValueOnce(pending.promise);
    const wrapper = render(SettingsIslands);
    await wrapper.get('input[type="search"]').setValue('space');
    expect(api.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/interests', expect.objectContaining({ params: { search: 'space', polarity: 'all', lifecycle: 'active', sort: 'strength' } }));
    pending.resolve(result([{ ...positive, name: 'Obsolete result' }])); await flushPromises();
    expect(wrapper.text()).not.toContain('Obsolete result');
    await button(wrapper, 'Positive').trigger('click'); await flushPromises();
    expect(button(wrapper, 'Positive').attributes('aria-pressed')).toBe('true');
    expect(api.get.mock.lastCall[1].params.polarity).toBe('positive');
    await button(wrapper, 'Archived').trigger('click'); await flushPromises();
    expect(api.get.mock.lastCall[1].params).toMatchObject({ polarity: 'all', lifecycle: 'archived' });
    await wrapper.get('select').setValue('recent'); await flushPromises();
    expect(api.get.mock.lastCall[1].params.sort).toBe('recent');
    await wrapper.get('select').setValue('name'); await flushPromises();
    expect(api.get.mock.lastCall[1].params.sort).toBe('name');
    await wrapper.get('input').setValue('discarded');
    wrapper.unmount(); await vi.advanceTimersByTimeAsync(300);
    expect(api.get.mock.lastCall[1].params.search).toBe('space');
  });

  it.each([
    ['All', { polarity: 'all', lifecycle: 'all' }],
    ['Positive', { polarity: 'positive', lifecycle: 'all' }],
    ['Negative', { polarity: 'negative', lifecycle: 'all' }],
    ['Active', { polarity: 'all', lifecycle: 'active' }],
    ['Archived', { polarity: 'all', lifecycle: 'archived' }]
  ])('sends the %s filter to the Interest API', async (label, params) => {
    const wrapper = render(SettingsIslands); await flushPromises();
    await button(wrapper, label).trigger('click'); await flushPromises();
    expect(api.get.mock.lastCall[1].params).toMatchObject(params);
  });

  it('inspects lazily with selection state, representative articles, retry and keyboard close', async () => {
    const wrapper = render(SettingsIslands); await flushPromises();
    const pending = deferred(); api.get.mockReturnValueOnce(pending.promise);
    const inspect = wrapper.get('[aria-label="Inspect Space exploration"]');
    inspect.element.focus(); await inspect.trigger('click');
    expect(wrapper.get('.interest-row--selected').text()).toContain('Space exploration');
    expect(inspect.attributes('aria-expanded')).toBe('true');
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Loading interest');
    pending.resolve({ data: { interest: { ...positive, representativeArticles: [{ id: 9, title: 'Moon mission', imageUrl: null, publishedAt: null, feed: { id: 1, feedName: 'Science news' } }] } } });
    await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/interests/1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Moon mission');
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Science news');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises();
    expect(wrapper.find('.interest-row--selected').exists()).toBe(false);
    expect(document.activeElement).toBe(inspect.element);
    api.get.mockRejectedValueOnce(new Error('missing'));
    await inspect.trigger('click'); await flushPromises();
    expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toContain('Unable to load interest details');
    api.get.mockResolvedValueOnce({ data: { interest: { ...positive, representativeArticles: [] } } });
    document.querySelector('[role="dialog"] .app-button').click(); await flushPromises();
    expect(document.querySelector('[role="dialog"]').textContent).toContain('No example articles are currently available');
  });

  it('mutes and unmutes a row locally while preserving filters, sort and Inspect', async () => {
    const wrapper = render(SettingsIslands); await flushPromises();
    await button(wrapper, 'Positive').trigger('click'); await flushPromises();
    await wrapper.get('select').setValue('name'); await flushPromises();
    const listCalls = api.get.mock.calls.length;
    const pending = deferred(); api.patch.mockReturnValueOnce(pending.promise);
    const mute = wrapper.get('[aria-label="Mute Space exploration"]');
    expect(mute.text()).toBe('Mute');
    await mute.trigger('click');
    expect(api.patch).toHaveBeenCalledWith('/interests/1', { muted: true });
    expect(mute.attributes('disabled')).toBeDefined();
    expect(wrapper.find('.interest-badge--muted').exists()).toBe(false);
    pending.resolve({ data: { interest: { ...positive, muted: true } } }); await flushPromises();
    expect(wrapper.get('.interest-badge--muted').text()).toBe('Muted');
    expect(wrapper.get('[aria-label="Unmute Space exploration"]').attributes('disabled')).toBeUndefined();
    expect(api.get).toHaveBeenCalledTimes(listCalls);
    expect(button(wrapper, 'Positive').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('select').element.value).toBe('name');

    api.patch.mockResolvedValueOnce({ data: { interest: { ...positive, muted: false } } });
    await wrapper.get('[aria-label="Unmute Space exploration"]').trigger('click'); await flushPromises();
    expect(api.patch).toHaveBeenLastCalledWith('/interests/1', { muted: false });
    expect(wrapper.find('.interest-badge--muted').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Mute Space exploration"]').text()).toBe('Mute');
    expect(api.get).toHaveBeenCalledTimes(listCalls);
    await wrapper.get('[aria-label="Inspect Space exploration"]').trigger('click'); await flushPromises();
    expect(wrapper.get('.interest-row--selected h3').text()).toBe('Space exploration');
  });

  it('retains the row and offers a retry when muting fails', async () => {
    api.patch.mockRejectedValueOnce(new Error('offline'));
    const wrapper = render(SettingsIslands); await flushPromises();
    await wrapper.get('[aria-label="Mute Space exploration"]').trigger('click'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Couldn’t update this interest');
    expect(wrapper.get('[aria-label="Mute Space exploration"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('.interest-badge--muted').exists()).toBe(false);
  });

  it('keeps Settings → Islands and removes standalone navigation', () => {
    const sidebar = render(Sidebar);
    expect(sidebar.text()).not.toContain('My interests');
    useSelectionStore().currentSelection.AIEnabled = true;
    const settings = render(Settings);
    expect(settings.findAll('.settings-sidebar-item').some(item => item.text() === 'Islands')).toBe(true);
    expect(useUiStore().page).toBeUndefined();
  });

  it('opens the Islands overview through Settings navigation and forwards an example article', async () => {
    useSelectionStore().currentSelection.AIEnabled = true;
    api.get.mockImplementation(async url => url === '/interests' ? result() : { data: { interest: {
      ...positive, representativeArticles: [{ id: 9, title: 'Moon mission', feed: { feedName: 'Science news' } }]
    } } });
    const settings = render(Settings);
    await button(settings, 'Islands').trigger('click'); await flushPromises();
    expect(settings.get('.settings-insight-card').text()).toContain('Your evolving interests');
    await settings.get('[aria-label="Inspect Space exploration"]').trigger('click'); await flushPromises();
    document.querySelector('.interest-example').click(); await flushPromises();
    expect(settings.emitted('open-article')).toEqual([[9]]);
  });

  it('opens Settings directly on Active Islands and inspects the matching ID', async () => {
    useSelectionStore().currentSelection.AIEnabled = true;
    api.get.mockImplementation(async url => url === '/interests'
      ? result([positive])
      : { data: { interest: { ...positive, representativeArticles: [] } } });
    const settings = render(Settings, { initialSection: 'islands', interestId: 1 });
    await flushPromises();
    expect(button(settings, 'Islands').attributes('aria-current')).toBe('page');
    expect(api.get).toHaveBeenCalledWith('/interests', expect.objectContaining({ params: expect.objectContaining({ lifecycle: 'active' }) }));
    expect(settings.get('.interest-row--selected h3').text()).toBe('Space exploration');
    expect(api.get).toHaveBeenCalledWith('/interests/1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(document.querySelector('.interest-inspector').textContent).toContain('Space exploration');
  });

  it('scrolls the linked island into view after opening its inspector', async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      api.get.mockImplementation(async url => url === '/interests'
        ? result([...Array.from({ length: 12 }, (_, index) => ({ ...positive, id: index + 3, name: `Interest ${index}` })), positive])
        : { data: { interest: { ...positive, representativeArticles: [] } } });
      const settings = render(Settings, { initialSection: 'islands', interestId: 1 });
      await flushPromises();
      expect(settings.findAll('.interest-row')).toHaveLength(13);
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView.mock.instances[0]).toBe(settings.get('.interest-row--selected').element);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    } finally {
      if (originalScrollIntoView) Element.prototype.scrollIntoView = originalScrollIntoView;
      else delete Element.prototype.scrollIntoView;
    }
  });

  it('tracks the clicked island when opening Settings from the reader', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener); opener.focus();
    const shell = { showSettingsModal: false, settingsSection: 'welcome', settingsInterestId: null };
    AppShell.methods.openInterestSettings.call(shell, 7);
    expect(shell).toMatchObject({ showSettingsModal: true, settingsSection: 'islands', settingsInterestId: 7,
      settingsReturnFocusTo: opener });
    opener.remove();
  });
});
