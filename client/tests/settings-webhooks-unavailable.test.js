import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsWebhooks from '../src/components/settings/SettingsWebhooks.vue';
import { createFocusedStores } from './helpers/focusedStores.js';
import { WEBHOOK_PERSISTENCE_AVAILABLE } from '../src/services/webhooks.js';

describe('Webhooks without a server API', () => {
  it('shows the editor without claiming a draft can be saved', async () => {
    expect(WEBHOOK_PERSISTENCE_AVAILABLE).toBe(false);
    const stores = createFocusedStores({ overview: { categories: [] } });
    const wrapper = mount(SettingsWebhooks, {
      global: { plugins: [stores.pinia], stubs: { BootstrapIcon: true } }
    });
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain('Saving and loading require the server API');
    expect(wrapper.text()).toContain('Configured webhooks unavailable');
    expect(wrapper.text()).not.toContain('No webhooks configured');
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true);
    expect(wrapper.find('.webhook-editor-actions .app-button--outline-danger').exists()).toBe(false);

    await wrapper.get('.webhook-editor-grid input[type="text"]').setValue('Draft webhook');
    await wrapper.get('input[type="url"]').setValue('https://example.com/hook');
    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 field"]').setValue('title');
    await wrapper.get('.webhook-condition-row select[aria-label="Condition 1 operator"]').setValue('contains');
    await wrapper.get('.webhook-condition-row input[aria-label="Condition 1 value"]').setValue('RSSMonster');
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.text()).not.toContain('Webhook created.');
    wrapper.unmount();
  });
});
