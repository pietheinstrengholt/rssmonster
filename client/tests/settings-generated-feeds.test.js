import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsGeneratedFeeds from '../src/components/settings/SettingsGeneratedFeeds.vue';
import ConfirmDialog from '../src/components/dialogs/ConfirmDialog.vue';
import {
  createGeneratedFeed,
  deleteGeneratedFeed,
  fetchGeneratedFeeds,
  regenerateGeneratedFeedToken,
  updateGeneratedFeed
} from '../src/api/generatedFeeds.js';

vi.mock('../src/api/generatedFeeds.js', () => ({
  createGeneratedFeed: vi.fn(),
  deleteGeneratedFeed: vi.fn(),
  fetchGeneratedFeeds: vi.fn(),
  regenerateGeneratedFeedToken: vi.fn(),
  updateGeneratedFeed: vi.fn()
}));

const generatedFeed = (overrides = {}) => ({
  id: 7,
  name: 'Security News',
  description: 'Selected security reporting',
  expression: 'tag:security sort:desc',
  token: 'a'.repeat(43),
  rssUrl: `https://rssmonster.test/rss/generated/${'a'.repeat(43)}`,
  enabled: true,
  tokenRegeneratedAt: '2026-09-02T10:00:00.000Z',
  createdAt: '2026-09-02T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  ...overrides
});

const mountPage = async () => {
  const wrapper = mount(SettingsGeneratedFeeds, {
    global: {
      stubs: { BootstrapIcon: true }
    }
  });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchGeneratedFeeds.mockResolvedValue({
    data: { total: 1, generatedFeeds: [generatedFeed()] }
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue() }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Generated Feeds settings', () => {
  it('loads the overview and opens an isolated editor for a selected feed', async () => {
    const wrapper = await mountPage();

    expect(fetchGeneratedFeeds).toHaveBeenCalledOnce();
    expect(wrapper.get('#generated-feeds-title').text()).toBe('Generated Feeds');
    expect(wrapper.text()).toContain('Security News');
    expect(wrapper.text()).toContain('tag:security sort:desc');
    expect(wrapper.text()).toContain('Enabled');

    await wrapper.get('.generated-feed-select').trigger('click');

    expect(wrapper.get('#generated-feed-editor-title').text()).toBe('Edit: Security News');
    expect(wrapper.get('.generated-feed-expression-field textarea').element.value)
      .toBe('tag:security sort:desc');
    expect(wrapper.get('.generated-feed-sharing input').element.value)
      .toBe(generatedFeed().rssUrl);
  });

  it('validates with the shared Smart Folder rules before creating a feed', async () => {
    fetchGeneratedFeeds.mockResolvedValue({ data: { total: 0, generatedFeeds: [] } });
    const wrapper = await mountPage();

    await wrapper.get('.generated-feeds-create').trigger('click');
    await wrapper.get('.generated-feed-fields-row input').setValue('AI feed');
    await wrapper.get('.generated-feed-expression-field textarea').setValue('quallity:>=0.8');
    await wrapper.get('.generated-feed-editor').trigger('submit');

    expect(wrapper.get('.expression-editor__validation').text()).toContain('Did you mean "quality"?');
    expect(createGeneratedFeed).not.toHaveBeenCalled();

    const created = generatedFeed({ id: 8, name: 'AI feed', expression: 'tag:ai sort:quality' });
    createGeneratedFeed.mockResolvedValue({ data: { generatedFeed: created } });
    await wrapper.get('.generated-feed-expression-field textarea').setValue('tag:ai sort:quality');
    await wrapper.get('.generated-feed-editor').trigger('submit');
    await flushPromises();

    expect(createGeneratedFeed).toHaveBeenCalledWith({
      name: 'AI feed',
      description: null,
      expression: 'tag:ai sort:quality',
      enabled: true
    });
    expect(wrapper.text()).toContain('Generated Feed created.');
    expect(wrapper.get('#generated-feed-editor-title').text()).toBe('Edit: AI feed');
  });

  it('updates configuration and copies the complete RSS URL', async () => {
    const wrapper = await mountPage();
    await wrapper.get('.generated-feed-select').trigger('click');
    const fields = wrapper.findAll('.generated-feed-fields-row input');
    await fields[0].setValue('Updated Security');
    await fields[1].setValue('Updated description');
    updateGeneratedFeed.mockResolvedValue({
      data: { generatedFeed: generatedFeed({ name: 'Updated Security', description: 'Updated description' }) }
    });

    await wrapper.get('.generated-feed-editor').trigger('submit');
    await flushPromises();
    await wrapper.get('.generated-feed-sharing__url button').trigger('click');

    expect(updateGeneratedFeed).toHaveBeenCalledWith(7, {
      name: 'Updated Security',
      description: 'Updated description',
      expression: 'tag:security sort:desc',
      enabled: true
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(generatedFeed().rssUrl);
  });

  it('enables and disables a feed without regenerating its URL', async () => {
    const wrapper = await mountPage();
    await wrapper.get('.generated-feed-select').trigger('click');
    const disabledFeed = generatedFeed({ enabled: false });
    updateGeneratedFeed.mockResolvedValue({ data: { generatedFeed: disabledFeed } });

    await wrapper.vm.toggleEnabled(wrapper.vm.generatedFeeds[0]);
    await flushPromises();

    expect(updateGeneratedFeed).toHaveBeenCalledWith(7, { enabled: false });
    expect(wrapper.vm.generatedFeeds[0]).toEqual(disabledFeed);
    expect(wrapper.vm.draft.enabled).toBe(false);
    expect(regenerateGeneratedFeedToken).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Generated Feed disabled.');
  });

  it('requires confirmation before regenerating or deleting a URL', async () => {
    const wrapper = await mountPage();
    const replacement = generatedFeed({
      token: 'b'.repeat(43),
      rssUrl: `https://rssmonster.test/rss/generated/${'b'.repeat(43)}`
    });
    regenerateGeneratedFeedToken.mockResolvedValue({ data: { generatedFeed: replacement } });

    wrapper.vm.requestConfirmation('regenerate', wrapper.vm.generatedFeeds[0]);
    await wrapper.vm.$nextTick();
    expect(regenerateGeneratedFeedToken).not.toHaveBeenCalled();
    expect(wrapper.findComponent(ConfirmDialog).props('variant')).toBe('warning');
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm');
    await flushPromises();

    expect(regenerateGeneratedFeedToken).toHaveBeenCalledWith(7);
    expect(wrapper.text()).toContain('Generated Feed URL regenerated.');

    deleteGeneratedFeed.mockResolvedValue({});
    wrapper.vm.requestConfirmation('delete', wrapper.vm.generatedFeeds[0]);
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(ConfirmDialog).props('variant')).toBe('danger');
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm');
    await flushPromises();

    expect(deleteGeneratedFeed).toHaveBeenCalledWith(7);
    expect(wrapper.text()).toContain('No Generated Feeds yet');
  });

  it('shows useful server validation errors without replacing persisted state', async () => {
    const wrapper = await mountPage();
    await wrapper.get('.generated-feed-select').trigger('click');
    updateGeneratedFeed.mockRejectedValue({
      response: { data: { error: { message: 'Unknown expression field: "quallity".' } } }
    });
    await wrapper.get('.generated-feed-expression-field textarea').setValue('tag:security');
    await wrapper.get('.generated-feed-editor').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Unknown expression field');
    expect(wrapper.vm.generatedFeeds[0].expression).toBe('tag:security sort:desc');
  });

  it('shows a recoverable load failure and retries without opening an editor', async () => {
    fetchGeneratedFeeds.mockRejectedValueOnce(new Error('offline'));
    const wrapper = await mountPage();

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load Generated Feeds');
    expect(wrapper.find('.generated-feed-editor').exists()).toBe(false);

    fetchGeneratedFeeds.mockResolvedValueOnce({
      data: { total: 1, generatedFeeds: [generatedFeed()] }
    });
    await wrapper.get('.settings-state button').trigger('click');
    await flushPromises();

    expect(fetchGeneratedFeeds).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Security News');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('blocks an empty name even when the expression is valid', async () => {
    fetchGeneratedFeeds.mockResolvedValue({ data: { total: 0, generatedFeeds: [] } });
    const wrapper = await mountPage();

    await wrapper.get('.generated-feeds-create').trigger('click');
    await wrapper.get('.generated-feed-expression-field textarea').setValue('tag:security');
    await wrapper.get('.generated-feed-editor').trigger('submit');

    expect(wrapper.get('.generated-feed-field-error').text()).toBe('Name cannot be empty.');
    expect(createGeneratedFeed).not.toHaveBeenCalled();
  });

  it('recovers from clipboard and mutation failures without changing local state', async () => {
    const wrapper = await mountPage();
    await wrapper.get('.generated-feed-select').trigger('click');
    const originalFeed = { ...wrapper.vm.generatedFeeds[0] };
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));

    await wrapper.get('.generated-feed-sharing__url button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Could not copy the RSS URL');
    expect(select).toHaveBeenCalledOnce();

    updateGeneratedFeed.mockRejectedValueOnce({
      response: { data: { message: 'Status update rejected.' } }
    });
    await wrapper.vm.toggleEnabled(wrapper.vm.generatedFeeds[0]);
    expect(wrapper.text()).toContain('Status update rejected.');
    expect(wrapper.vm.generatedFeeds[0]).toEqual(originalFeed);
    expect(wrapper.vm.operationBusy).toBe(false);

    regenerateGeneratedFeedToken.mockRejectedValueOnce(new Error('regeneration failed'));
    wrapper.vm.requestConfirmation('regenerate', wrapper.vm.generatedFeeds[0]);
    await wrapper.vm.confirmAction();
    expect(wrapper.text()).toContain('Could not regenerate the Generated Feed');
    expect(wrapper.vm.confirmation.type).toBe('regenerate');
    expect(wrapper.vm.operationBusy).toBe(false);
  });

  it('cancels destructive confirmations without calling the API', async () => {
    const wrapper = await mountPage();
    wrapper.vm.requestConfirmation('delete', wrapper.vm.generatedFeeds[0]);
    await wrapper.vm.$nextTick();

    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel');
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(ConfirmDialog).exists()).toBe(false);
    expect(deleteGeneratedFeed).not.toHaveBeenCalled();
  });
});
