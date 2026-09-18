import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SettingsCrawl from '../src/components/settings/SettingsCrawl.vue';
import { fetchCrawlSettings, saveCrawlSettings, clearCrawlSettings } from '../src/api/settings';
vi.mock('../src/api/settings', () => ({ fetchCrawlSettings: vi.fn(), saveCrawlSettings: vi.fn(), clearCrawlSettings: vi.fn() }));
const configuration = (overridden = false) => ({ overridden, effectiveParallel: 0, effectiveLeaseMs: 120000, fields: [
  { key: 'CRAWL_PARALLELPROCESSFLAG', label: 'Parallel processing', group: 'Scheduling', value: 0, defaultValue: 0, min: 0, max: 1 },
  { key: 'FEED_MAX_ENTRIES', label: 'Maximum entries', group: 'Parser', value: 1000, defaultValue: 1000, suggestedValue: 2000, min: 1, max: 2147483647 }
] });
beforeEach(() => {
  vi.resetAllMocks(); fetchCrawlSettings.mockResolvedValue({ data: configuration() });
  saveCrawlSettings.mockResolvedValue({ data: configuration(true) }); clearCrawlSettings.mockResolvedValue({ data: configuration() });
});
const render = async () => { const wrapper = mount(SettingsCrawl); await flushPromises(); return wrapper; };
it('uses a single override and submits numeric values for the entire group', async () => {
  const wrapper = await render();
  expect(wrapper.findAll('[type=checkbox]')).toHaveLength(1);
  expect(wrapper.get('fieldset').element.disabled).toBe(true);
  await wrapper.get('[type=checkbox]').setValue(true);
  await wrapper.get('#CRAWL_PARALLELPROCESSFLAG').setValue(1);
  await wrapper.get('#FEED_MAX_ENTRIES').setValue(2000);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(saveCrawlSettings).toHaveBeenCalledWith({ overridden: true, values: { CRAWL_PARALLELPROCESSFLAG: 1, FEED_MAX_ENTRIES: 2000 } });
  expect(wrapper.get('[role=status]').text()).toBe('Crawl settings saved.');
});
it('restores inheritance and offers the requested suggested values without saving automatically', async () => {
  const wrapper = await render();
  await wrapper.get('[type=checkbox]').setValue(true);
  await wrapper.findAll('button').find(button => button.text() === 'Use suggested values').trigger('click');
  expect(wrapper.get('#FEED_MAX_ENTRIES').element.value).toBe('2000');
  expect(saveCrawlSettings).not.toHaveBeenCalled();
  await wrapper.get('[type=checkbox]').setValue(false);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(saveCrawlSettings).toHaveBeenCalledWith({ overridden: false });
});
it('keeps edits and shows validation failures', async () => {
  saveCrawlSettings.mockRejectedValue({ response: { data: { error: 'FEED_MAX_ENTRIES must be positive' } } });
  const wrapper = await render(); await wrapper.get('[type=checkbox]').setValue(true);
  await wrapper.get('#FEED_MAX_ENTRIES').setValue(0);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('FEED_MAX_ENTRIES');
  expect(wrapper.get('#FEED_MAX_ENTRIES').element.value).toBe('0');
});
it('requires confirmation to remove the saved configuration', async () => {
  const wrapper = await render();
  await wrapper.findAll('button').find(button => button.text() === 'Restore environment defaults').trigger('click');
  expect(clearCrawlSettings).not.toHaveBeenCalled();
  await wrapper.findAll('button').find(button => button.text() === 'Restore defaults').trigger('click'); await flushPromises();
  expect(clearCrawlSettings).toHaveBeenCalledOnce();
});
