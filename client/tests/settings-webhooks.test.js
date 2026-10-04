import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsWebhooks from '../src/components/settings/SettingsWebhooks.vue';
import ConfirmDialog from '../src/components/dialogs/ConfirmDialog.vue';
import { createFocusedStores } from './helpers/focusedStores.js';
import { createWebhook, deleteWebhook, fetchWebhooks, updateWebhook } from '../src/services/webhooks.js';
import { generateWebhookSecret, summarizeWebhookConditions } from '../src/services/webhookConditions.js';

vi.mock('../src/services/webhooks.js', () => ({
  createWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  fetchWebhooks: vi.fn(),
  updateWebhook: vi.fn()
}));

const categories = [{
  id: 3,
  name: 'Technology',
  feeds: [{ id: 7, feedName: 'OpenAI Blog' }]
}];

const webhook = (overrides = {}) => ({
  id: 11,
  name: 'Home Assistant alerts',
  enabled: true,
  endpointUrl: 'https://example.com/webhook',
  matchMode: 'ALL',
  conditions: [
    { field: 'category', operator: 'is', value: '3' },
    { field: 'title', operator: 'contains', value: 'Home Assistant' }
  ],
  ...overrides
});

const mountPage = async (items = [webhook()]) => {
  fetchWebhooks.mockResolvedValue(items);
  const stores = createFocusedStores({ overview: { categories } });
  const wrapper = mount(SettingsWebhooks, {
    global: { plugins: [stores.pinia], stubs: { BootstrapIcon: true } }
  });
  await flushPromises();
  return wrapper;
};

beforeEach(() => vi.clearAllMocks());

describe('Webhooks settings', () => {
  it('loads and selects configured webhooks with readable status and rules', async () => {
    const wrapper = await mountPage([
      webhook(),
      webhook({ id: 12, name: 'OpenAI Blog updates', enabled: false,
        conditions: [{ field: 'feed', operator: 'is', value: '7' }] })
    ]);

    expect(fetchWebhooks).toHaveBeenCalledOnce();
    expect(wrapper.get('#settings-webhooks-title').text()).toBe('Webhooks');
    expect(wrapper.text()).not.toContain('Webhook delivery is not active yet');
    expect(wrapper.text()).toContain('Technology + title contains "Home Assistant"');
    expect(wrapper.text()).toContain('Paused');
    await wrapper.findAll('.webhook-list-item')[1].trigger('click');
    expect(wrapper.findAll('.webhook-list-item')[1].attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('#webhook-editor-title').text()).toBe('Edit OpenAI Blog updates');
    expect(wrapper.get('.webhook-condition-row select[aria-label="Condition 1 value"]').element.value).toBe('7');
    wrapper.unmount();
  });

  it('shows the empty state and starts a single-condition draft', async () => {
    const wrapper = await mountPage([]);

    expect(wrapper.text()).toContain('No webhooks configured');
    expect(wrapper.text()).toContain('Create a webhook to send matching RSSMonster articles to another service.');
    expect(wrapper.findAll('.webhook-condition-row')).toHaveLength(1);
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true);
    await wrapper.get('.webhook-empty button').trigger('click');
    expect(wrapper.get('#webhook-editor-title').text()).toBe('New webhook');
    wrapper.unmount();
  });

  it('edits match mode, conditions, and enabled state with field-specific operators', async () => {
    const wrapper = await mountPage([]);

    await wrapper.get('.webhook-match-mode button:last-child').trigger('click');
    expect(wrapper.get('.webhook-match-mode button:last-child').attributes('aria-pressed')).toBe('true');
    await wrapper.get('.webhook-enabled input').setValue(false);
    expect(wrapper.get('.webhook-enabled input').element.checked).toBe(false);

    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 field"]').setValue('feed');
    expect(wrapper.get('.webhook-condition-row select[aria-label="Condition 1 operator"]').findAll('option').map(item => item.text()))
      .toEqual(['Select operator', 'is', 'is not']);
    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 operator"]').setValue('is');
    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 value"]').setValue('7');
    await wrapper.get('.webhook-add-condition').trigger('click');
    expect(wrapper.findAll('.webhook-condition-row')).toHaveLength(2);
    await wrapper.get('select[aria-label="Condition 2 field"]').setValue('domain');
    expect(wrapper.get('select[aria-label="Condition 2 operator"]').findAll('option').map(item => item.text()))
      .toEqual(['Select operator', 'is', 'is not']);
    await wrapper.get('[aria-label="Remove condition 2"]').trigger('click');
    expect(wrapper.findAll('.webhook-condition-row')).toHaveLength(1);
    wrapper.unmount();
  });

  it('validates the URL and conditions before creating, then sends only a valid draft', async () => {
    const wrapper = await mountPage([]);
    await wrapper.get('.webhook-editor-grid input[type="text"]').setValue('New webhook');
    await wrapper.get('input[type="url"]').setValue('ftp://example.com/hook');
    await wrapper.get('input[type="url"]').trigger('blur');
    expect(wrapper.get('.webhook-field-error').text()).toContain('HTTP or HTTPS');
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true);

    await wrapper.get('input[type="url"]').setValue('https://example.com/hook');
    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 field"]').setValue('category');
    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 operator"]').setValue('is');
    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 value"]').setValue('3');
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(false);

    createWebhook.mockResolvedValue(webhook({ id: 20, name: 'New webhook', endpointUrl: 'https://example.com/hook',
      conditions: [{ field: 'category', operator: 'is', value: '3' }] }));
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createWebhook).toHaveBeenCalledWith({
      name: 'New webhook', enabled: true, endpointUrl: 'https://example.com/hook',
      matchMode: 'ALL', conditions: [{ field: 'category', operator: 'is', value: '3' }]
    });
    expect(wrapper.text()).toContain('Webhook created.');
    expect(wrapper.text()).toContain('New webhook');
    wrapper.unmount();
  });

  it('updates a selected webhook without resending its undisclosed secret', async () => {
    const wrapper = await mountPage();
    await wrapper.get('.webhook-editor-grid input[type="text"]').setValue('Updated alerts');
    await wrapper.get('.webhook-match-mode button:last-child').trigger('click');
    updateWebhook.mockResolvedValue(webhook({ name: 'Updated alerts', matchMode: 'ANY' }));

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(updateWebhook).toHaveBeenCalledWith(11, expect.objectContaining({
      name: 'Updated alerts', matchMode: 'ANY'
    }));
    expect(updateWebhook.mock.calls[0][1]).not.toHaveProperty('secret');
    expect(wrapper.text()).toContain('Webhook saved.');
    wrapper.unmount();
  });

  it('keeps the edited draft and re-enables saving after an API validation failure', async () => {
    const wrapper = await mountPage();
    await wrapper.get('.webhook-editor-grid input[type="text"]').setValue('Unsaved changes');
    updateWebhook.mockRejectedValueOnce({ response: { data: { error: { code: 'NAME_INVALID', message: 'Name rejected.' } } } });
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Name rejected.');
    expect(wrapper.get('.webhook-editor-grid input[type="text"]').element.value).toBe('Unsaved changes');
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(false);
    wrapper.unmount();
  });

  it('selects another saved webhook after deletion', async () => {
    const wrapper = await mountPage([webhook(), webhook({ id: 12, name: 'Other webhook' })]);
    deleteWebhook.mockResolvedValue();
    await wrapper.get('.webhook-editor-actions .app-button--outline-danger').trigger('click');
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm');
    await flushPromises();

    expect(wrapper.get('#webhook-editor-title').text()).toBe('Edit Other webhook');
    expect(wrapper.findAll('.webhook-list-item')).toHaveLength(1);
    wrapper.unmount();
  });

  it('generates a browser-crypto secret and confirms deletion', async () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const wrapper = await mountPage();
    await wrapper.get('.webhook-secret button:last-child').trigger('click');
    const generatedSecret = wrapper.get('#webhook-signing-secret').element.value;
    expect(generatedSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(wrapper.get('#webhook-signing-secret').element.type).toBe('text');
    await wrapper.get('[aria-label="Hide signing secret"]').trigger('click');
    expect(wrapper.get('#webhook-signing-secret').element.type).toBe('password');

    updateWebhook.mockResolvedValue(webhook());
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(updateWebhook).toHaveBeenCalledWith(11, expect.objectContaining({ secret: generatedSecret }));

    deleteWebhook.mockResolvedValue();
    await wrapper.get('.webhook-editor-actions .app-button--outline-danger').trigger('click');
    expect(deleteWebhook).not.toHaveBeenCalled();
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm');
    await flushPromises();
    expect(deleteWebhook).toHaveBeenCalledWith(11);
    expect(wrapper.text()).toContain('No webhooks configured');
    wrapper.unmount();
  });

  it('shows a load error instead of an empty collection and can retry', async () => {
    fetchWebhooks.mockRejectedValueOnce(new Error('offline'));
    const stores = createFocusedStores({ overview: { categories } });
    const wrapper = mount(SettingsWebhooks, {
      global: { plugins: [stores.pinia], stubs: { BootstrapIcon: true } }
    });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load webhooks');
    expect(wrapper.text()).not.toContain('No webhooks configured');
    fetchWebhooks.mockResolvedValueOnce([]);
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('No webhooks configured');
    wrapper.unmount();
  });

  it('summarizes deterministic conditions without evaluating them', () => {
    expect(summarizeWebhookConditions([{ field: 'category', operator: 'is', value: '3' }], categories))
      .toBe('Category: Technology');
    expect(summarizeWebhookConditions([{ field: 'feed', operator: 'is', value: '7' }], categories))
      .toBe('Feed: OpenAI Blog');
    expect(summarizeWebhookConditions(webhook().conditions, categories))
      .toBe('Technology + title contains "Home Assistant"');
    expect(summarizeWebhookConditions(webhook().conditions, categories, 'ANY'))
      .toBe('Technology or title contains "Home Assistant"');
  });
});
