import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SettingsInferenceRuntime from '../src/components/settings/SettingsInferenceRuntime.vue';
import { fetchInferenceRuntimeSettings, saveInferenceRuntimeSettings, clearInferenceRuntimeSettings } from '../src/api/settings';
vi.mock('../src/api/settings', () => ({ fetchInferenceRuntimeSettings: vi.fn(), saveInferenceRuntimeSettings: vi.fn(), clearInferenceRuntimeSettings: vi.fn() }));
const configuration = (overridden = false) => ({ overridden, fields: [
  { key: 'INFERENCE_TIMEOUT_MS', label: 'Request timeout', group: 'Timeouts', value: 30000, type: 'number', min: 1, max: 2147483647 },
  { key: 'INFERENCE_AI_ENABLED', label: 'Allow inference', group: 'Permissions', value: null, type: 'permission' },
  { key: 'SKIP_ARTICLE_EMBEDDINGS', label: 'Skip article embeddings', group: 'Processing', value: false, type: 'boolean' }
] });
beforeEach(() => {
  vi.resetAllMocks(); fetchInferenceRuntimeSettings.mockResolvedValue({ data: configuration() });
  saveInferenceRuntimeSettings.mockResolvedValue({ data: configuration(true) });
  clearInferenceRuntimeSettings.mockResolvedValue({ data: configuration() });
});
const render = async () => { const wrapper = mount(SettingsInferenceRuntime); await flushPromises(); return wrapper; };
it('saves typed values for the group and allows automatic permission', async () => {
  const wrapper = await render();
  expect(wrapper.get('fieldset').element.disabled).toBe(true);
  await wrapper.get('[type=checkbox]').setValue(true);
  await wrapper.get('#INFERENCE_TIMEOUT_MS').setValue(15000);
  await wrapper.get('#SKIP_ARTICLE_EMBEDDINGS').setValue('true');
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(saveInferenceRuntimeSettings).toHaveBeenCalledWith({ overridden: true, values: { INFERENCE_TIMEOUT_MS: 15000, INFERENCE_AI_ENABLED: null, SKIP_ARTICLE_EMBEDDINGS: true } });
  expect(wrapper.get('[role=status]').text()).toBe('Runtime settings saved.');
  expect(wrapper.emitted('saved')).toHaveLength(1);
});
it('saves explicit false permissions and restores inheritance when unchecked', async () => {
  const wrapper = await render();
  await wrapper.get('[type=checkbox]').setValue(true);
  await wrapper.get('#INFERENCE_AI_ENABLED').setValue('false');
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(saveInferenceRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ INFERENCE_AI_ENABLED: false }) }));
  await wrapper.get('[type=checkbox]').setValue(false);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(saveInferenceRuntimeSettings).toHaveBeenLastCalledWith({ overridden: false });
});
it('keeps the draft after a failed save and supports retrying failed loads', async () => {
  fetchInferenceRuntimeSettings.mockRejectedValueOnce(new Error('unavailable'));
  const wrapper = await render();
  await wrapper.get('button').trigger('click'); await flushPromises();
  await wrapper.get('[type=checkbox]').setValue(true);
  await wrapper.get('#INFERENCE_TIMEOUT_MS').setValue(0);
  saveInferenceRuntimeSettings.mockRejectedValue({ response: { data: { error: 'INFERENCE_TIMEOUT_MS must be positive' } } });
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('INFERENCE_TIMEOUT_MS');
  expect(wrapper.get('#INFERENCE_TIMEOUT_MS').element.value).toBe('0');
  expect(wrapper.emitted('saved')).toBeUndefined();
});
it('confirms restoring environment defaults', async () => {
  const wrapper = await render();
  await wrapper.findAll('button').find(button => button.text() === 'Restore environment defaults').trigger('click');
  expect(clearInferenceRuntimeSettings).not.toHaveBeenCalled();
  await wrapper.findAll('button').find(button => button.text() === 'Restore defaults').trigger('click'); await flushPromises();
  expect(clearInferenceRuntimeSettings).toHaveBeenCalledOnce();
});
