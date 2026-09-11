import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsInference from '../src/components/settings/SettingsInference.vue';
import { fetchInferenceSettings, saveInferenceSettings, clearInferenceSettings, testInferenceSettings } from '../src/api/settings';
vi.mock('../src/api/settings', () => ({ fetchInferenceSettings: vi.fn(), saveInferenceSettings: vi.fn(), clearInferenceSettings: vi.fn(), testInferenceSettings: vi.fn() }));
const configuration = (source = 'database') => ({ configurationSource: source, configurable: source !== 'environment', baseUrl: source === 'none' ? null : 'http://inference', apiKeyConfigured: source !== 'none' });
const status = { state: 'partial', ready: true, capabilities: { embeddings: { configured: true, available: true, model: 'embedding-model', provider: 'local', dimensions: 1024 } } };
beforeEach(() => {
  vi.clearAllMocks(); fetchInferenceSettings.mockResolvedValue({ data: { ...configuration(), status } });
  saveInferenceSettings.mockResolvedValue({ data: configuration() }); testInferenceSettings.mockResolvedValue({ data: status });
  clearInferenceSettings.mockResolvedValue({ data: configuration('none') });
});
const render = async () => { const wrapper = mount(SettingsInference); await flushPromises(); return wrapper; };
describe('Inference Settings', () => {
  it('hides every connection control for environment-managed deployments', async () => {
    fetchInferenceSettings.mockResolvedValue({ data: { ...configuration('environment'), status } });
    const wrapper = await render();
    expect(wrapper.get('.inference-capabilities').text()).toContain('local');
    expect(wrapper.get('.inference-capabilities').text()).toContain('embedding-model');
    expect(wrapper.find('form').exists()).toBe(false); expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.text()).toContain('configured by the deployment'); expect(wrapper.text()).toContain('embedding-model');
    expect(wrapper.text()).toContain('1024 dimensions'); expect(wrapper.text()).not.toContain('Remove connection');
    await wrapper.get('button').trigger('click'); await flushPromises(); expect(testInferenceSettings).toHaveBeenCalled();
  });
  it('shows the empty state and editable controls without a secret value', async () => {
    fetchInferenceSettings.mockResolvedValue({ data: { ...configuration('none'), status: { state: 'not_configured' } } });
    const wrapper = await render(); expect(wrapper.text()).toContain('No inference service configured.');
    expect(wrapper.find('#inference-endpoint').exists()).toBe(true); expect(wrapper.find('#inference-key-action').exists()).toBe(true);
    expect(wrapper.find('[type=password]').exists()).toBe(false);
  });
  it.each(['keep', 'replace', 'remove'])('tests an unsaved endpoint with an empty key using %s without saving', async action => {
    fetchInferenceSettings.mockResolvedValue({ data: { ...configuration('none'), status: { state: 'not_configured' } } });
    const wrapper = await render();
    const testButton = wrapper.findAll('button').find(button => button.text() === 'Test connection');
    expect(testButton.attributes('disabled')).toBeDefined();
    await wrapper.get('#inference-endpoint').setValue('http://127.0.0.1:3001/');
    await wrapper.get('#inference-key-action').setValue(action);
    expect(testButton.attributes('disabled')).toBeUndefined();
    if (action === 'replace') expect(wrapper.get('#inference-api-key').attributes('required')).toBeUndefined();
    await testButton.trigger('click'); await flushPromises();
    expect(testInferenceSettings).toHaveBeenCalledWith({ baseUrl: 'http://127.0.0.1:3001/', apiKeyAction: action,
      ...(action === 'replace' ? { apiKey: '' } : {}) });
    expect(saveInferenceSettings).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Connected and ready.');
  });
  it.each(['keep', 'replace', 'remove'])('saves explicit %s key semantics', async action => {
    const wrapper = await render(); await wrapper.get('#inference-key-action').setValue(action);
    if (action === 'replace') await wrapper.get('#inference-api-key').setValue('new-key');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(saveInferenceSettings).toHaveBeenCalledWith({ baseUrl: 'http://inference', apiKeyAction: action, ...(action === 'replace' ? { apiKey: 'new-key' } : {}) });
    expect(wrapper.vm.apiKey).toBe(''); expect(wrapper.emitted('forceReload')).toBeTruthy();
  });
  it('requires confirmation and clears configuration', async () => {
    const wrapper = await render();
    await wrapper.findAll('button').find(button => button.text() === 'Remove connection').trigger('click');
    expect(clearInferenceSettings).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === 'Confirm removal').trigger('click'); await flushPromises();
    expect(clearInferenceSettings).toHaveBeenCalled(); expect(wrapper.text()).toContain('No inference service configured.');
  });
  it.each(['unreachable', 'unauthorized', 'not_ready', 'incompatible'])('shows safe %s status', async state => {
    fetchInferenceSettings.mockResolvedValue({ data: { ...configuration(), status: { state } } });
    const wrapper = await render(); expect(wrapper.get('[role=status]').text()).not.toBe('Connection status is unavailable.');
    expect(wrapper.findAll('.inference-capabilities article')).toHaveLength(4);
  });
});
