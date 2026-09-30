import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InitialFeeds from '../src/components/onboarding/InitialFeeds.vue';
import ImportSubscriptions from '../src/components/dialogs/feeds/ImportSubscriptions.vue';
import ArticleEmptyState from '../src/components/articles/ArticleEmptyState.vue';
import { createFocusedStores } from './helpers/focusedStores.js';
import { previewOpml, pollOpmlPreview, importOpml } from '../src/api/opml';
import { completeOnboarding, fetchSettings } from '../src/api/settings';

vi.mock('../src/api/opml', () => ({ previewOpml: vi.fn(), pollOpmlPreview: vi.fn(), importOpml: vi.fn() }));
vi.mock('../src/api/settings', () => ({ completeOnboarding: vi.fn(), fetchSettings: vi.fn() }));
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); });
const button = label => wrapper.findAll('button').find(button => button.text().includes(label));

describe('first-time entry', () => {
  it.each([['Add your first RSS Feed', 'NewFeed'], ['Import subscriptions', 'ImportSubscriptions']])('opens %s directly', async (label, modal) => {
    const stores = createFocusedStores();
    wrapper = mount(InitialFeeds, { global: { plugins: [stores.pinia], stubs: { BootstrapIcon: true } } });
    await button(label).trigger('click');
    expect(stores.uiStore.showModal).toBe(modal);
  });

  it('persists completion across settings reloads and clears it for another session', async () => {
    const { selectionStore } = createFocusedStores();
    completeOnboarding.mockResolvedValue({ data: { onboardingCompleted: true } });
    await selectionStore.completeOnboarding();
    expect(selectionStore.onboardingCompleted).toBe(true);
    selectionStore.resetSessionState();
    expect(selectionStore.onboardingCompleted).toBe(false);
    fetchSettings.mockResolvedValue({ data: { onboardingCompleted: true } });
    await selectionStore.fetchSettings();
    expect(selectionStore.onboardingCompleted).toBe(true);
  });

  it('offers feed and import actions for an empty account', async () => {
    wrapper = mount(ArticleEmptyState, { props: { noFeeds: true }, global: { stubs: { BootstrapIcon: true } } });
    expect(wrapper.text()).toContain('No feeds yet');
    expect(wrapper.text()).not.toContain('Explore smart folders');
    await button('Add a feed').trigger('click');
    await button('Import OPML').trigger('click');
    expect(wrapper.emitted('add-feed')).toHaveLength(1);
    expect(wrapper.emitted('import-opml')).toHaveLength(1);
  });

  it('previews and imports a new user’s OPML only after confirmation', async () => {
    const stores = createFocusedStores({ overview: { fetchOverviewSplit: vi.fn().mockResolvedValue(true) } });
    const preview = { subscriptions: [{ title: 'My feed', inputUrl: 'https://example.test/feed', connectionStatus: 'available' }], categories: [], categoryOptions: [] };
    previewOpml.mockResolvedValue({ data: preview });
    pollOpmlPreview.mockResolvedValue(preview);
    importOpml.mockResolvedValue({ data: { categoriesCreated: 1, feedsCreated: 1 } });
    wrapper = mount(ImportSubscriptions, { global: { plugins: [stores.pinia], stubs: { BootstrapIcon: true } } });
    const input = wrapper.get('input[type="file"]');
    const openFilePicker = vi.spyOn(input.element, 'click').mockImplementation(() => {});
    await button('Choose OPML file').trigger('click');
    expect(openFilePicker).toHaveBeenCalledOnce();
    expect(previewOpml).not.toHaveBeenCalled();
    Object.defineProperty(input.element, 'files', { value: [new File(['<opml/>'], 'feeds.opml')] });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.text()).toContain('My feed');
    expect(importOpml).not.toHaveBeenCalled();
    await button('Import 1 subscription').trigger('click');
    await flushPromises();
    expect(importOpml).toHaveBeenCalledWith(expect.objectContaining({ subscriptions: [expect.objectContaining({ title: 'My feed', selectedForImport: true })] }));
    expect(wrapper.text()).toContain('1 feed added');
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });
});
