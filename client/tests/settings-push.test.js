import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SettingsPush from '../src/components/settings/SettingsPush.vue';
import { fetchPushSettings, savePushSettings, clearPushSettings } from '../src/api/settings';
vi.mock('../src/api/settings', () => ({ fetchPushSettings: vi.fn(), savePushSettings: vi.fn(), clearPushSettings: vi.fn() }));
const configuration = (overridden = false) => ({ overridden, configured: true, fields: {
  VAPID_PUBLIC_KEY: { configured: true, overridden }, VAPID_PRIVATE_KEY: { configured: true, overridden },
  VAPID_SUBJECT: { value: 'mailto:admin@example.com', overridden }
} });
beforeEach(() => {
  vi.resetAllMocks();
  fetchPushSettings.mockResolvedValue({ data: configuration() });
  savePushSettings.mockResolvedValue({ data: configuration(true) });
  clearPushSettings.mockResolvedValue({ data: configuration() });
});
const render = async () => { const wrapper = mount(SettingsPush); await flushPromises(); return wrapper; };
describe('Web Push settings', () => {
  it('masks both keys and only enables fields under the group override', async () => {
    const wrapper = await render();
    expect(wrapper.get('fieldset').element.disabled).toBe(true);
    for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
      expect(wrapper.get(`#push-${key}`).attributes('type')).toBe('password');
      expect(wrapper.get(`#push-${key}`).element.value).toBe('');
    }
    await wrapper.get('[type=checkbox]').setValue(true);
    expect(wrapper.get('fieldset').element.disabled).toBe(false);
    await wrapper.get('#push-VAPID_PUBLIC_KEY').setValue('new-public');
    await wrapper.get('#push-VAPID_PRIVATE_KEY').setValue('new-private');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(savePushSettings).toHaveBeenCalledWith({ overridden: true, subject: 'mailto:admin@example.com', publicKey: 'new-public', privateKey: 'new-private' });
    expect(wrapper.get('#push-VAPID_PRIVATE_KEY').element.value).toBe('');
    expect(wrapper.get('[role=status]').text()).toBe('Web Push settings saved.');
  });
  it('retains unchanged saved keys and restores defaults when unchecked', async () => {
    fetchPushSettings.mockResolvedValue({ data: configuration(true) });
    const wrapper = await render();
    await wrapper.get('#push-subject').setValue('https://example.com');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(savePushSettings).toHaveBeenLastCalledWith({ overridden: true, subject: 'https://example.com' });
    await wrapper.get('[type=checkbox]').setValue(false);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(savePushSettings).toHaveBeenLastCalledWith({ overridden: false });
  });
  it('shows save errors and retains unsaved input', async () => {
    savePushSettings.mockRejectedValue({ response: { data: { error: 'ENCRYPTION_KEY is required' } } });
    const wrapper = await render();
    await wrapper.get('[type=checkbox]').setValue(true);
    await wrapper.get('#push-VAPID_PRIVATE_KEY').setValue('new-private');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('ENCRYPTION_KEY');
    expect(wrapper.get('#push-VAPID_PRIVATE_KEY').element.value).toBe('new-private');
  });
  it('clears both saved keys explicitly', async () => {
    fetchPushSettings.mockResolvedValue({ data: configuration(true) });
    const wrapper = await render();
    await wrapper.findAll('button').find(button => button.text() === 'Clear keys').trigger('click');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(savePushSettings).toHaveBeenCalledWith({ overridden: true, subject: 'mailto:admin@example.com', publicKey: '', privateKey: '' });
  });
  it('confirms restoring environment defaults', async () => {
    const wrapper = await render();
    await wrapper.findAll('button').find(button => button.text() === 'Restore environment defaults').trigger('click');
    expect(clearPushSettings).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === 'Restore defaults').trigger('click'); await flushPromises();
    expect(clearPushSettings).toHaveBeenCalledOnce();
  });
});
