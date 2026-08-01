import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsOfficialSources from '../src/components/settings/SettingsOfficialSources.vue';
import {
  fetchOfficialSources,
  saveOfficialSources
} from '../src/api/settings';
import { setAuthToken } from '../src/api/client';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/settings', () => ({
  fetchOfficialSources: vi.fn(),
  saveOfficialSources: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

// This function mounts official-source administration with an authenticated store.
const mountOfficialSources = () => {
  const stores = createFocusedStores({ auth: { token: 'admin-token' } });
  return mount(SettingsOfficialSources, {
    attachTo: document.body,
    global: {
      plugins: [stores.pinia],
      stubs: {
        BootstrapIcon: true
      }
    }
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchOfficialSources.mockResolvedValue({
    data: {
      officialSources: []
    }
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('official-source administration', () => {
  it('loads editable rows while preserving disabled sources', async () => {
    fetchOfficialSources.mockResolvedValue({
      data: {
        officialSources: [{
          domain: 'example.org',
          enabled: false,
          entity: 'Example'
        }]
      }
    });

    const wrapper = mountOfficialSources();
    await flushPromises();

    expect(setAuthToken).toHaveBeenCalledWith('admin-token');
    expect(wrapper.vm.sources).toMatchObject([{
      domain: 'example.org',
      enabled: false,
      entity: 'Example'
    }]);
    expect(wrapper.text()).toContain('1 configured domains');
  });

  it('shows a load failure without presenting an empty collection', async () => {
    const internalError = new Error('database unavailable');
    fetchOfficialSources.mockRejectedValue(internalError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mountOfficialSources();
    await flushPromises();

    expect(wrapper.get('.official-sources-message--error').text())
      .toBe('Failed to load official sources.');
    expect(wrapper.text()).not.toContain('No official sources yet.');
    expect(wrapper.vm.loading).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to fetch official sources:',
      internalError
    );
  });

  it('treats a malformed load response as an empty source collection', async () => {
    fetchOfficialSources.mockResolvedValue({ data: { officialSources: null } });

    const wrapper = mountOfficialSources();
    await flushPromises();

    expect(wrapper.vm.sources).toEqual([]);
    expect(wrapper.text()).toContain('No official sources yet.');
  });

  it('adds, focuses, toggles, and removes an editable source row', async () => {
    const wrapper = mountOfficialSources();
    await flushPromises();

    await wrapper.get('.official-sources-add-button').trigger('click');
    await flushPromises();

    const entityInput = wrapper.get('#official-source-entity-0');
    expect(document.activeElement).toBe(entityInput.element);
    expect(wrapper.vm.sources[0]).toMatchObject({
      domain: '',
      enabled: true,
      entity: ''
    });

    await entityInput.setValue('Example');
    await wrapper.get('input[placeholder="nintendo.com"]').setValue('example.org');
    expect(wrapper.vm.sources[0]).toMatchObject({
      domain: 'example.org',
      entity: 'Example'
    });

    await wrapper.get('.official-sources-toggle input').setValue(false);
    expect(wrapper.get('.official-sources-toggle span').text()).toBe('Off');

    await wrapper.get('.official-sources-delete-button').trigger('click');
    expect(wrapper.vm.sources).toEqual([]);
  });

  it('saves trimmed complete rows and emits completion', async () => {
    saveOfficialSources.mockResolvedValue({
      data: {
        officialSources: [{
          domain: 'example.org',
          enabled: true,
          entity: 'Example'
        }]
      }
    });
    const wrapper = mountOfficialSources();
    await flushPromises();
    await wrapper.setData({
      sources: [
        { domain: ' example.org ', enabled: true, entity: ' Example ', localId: 1 },
        { domain: '', enabled: true, entity: '', localId: 2 }
      ]
    });

    await wrapper.get('.official-sources-save-button').trigger('click');
    await flushPromises();

    expect(saveOfficialSources).toHaveBeenCalledWith([{
      domain: 'example.org',
      enabled: true,
      entity: 'Example'
    }]);
    expect(wrapper.text()).toContain('Official sources saved.');
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('uses an empty collection when the save response has no source array', async () => {
    saveOfficialSources.mockResolvedValue({ data: {} });
    const wrapper = mountOfficialSources();
    await flushPromises();
    await wrapper.setData({
      sources: [{
        domain: 'example.org',
        enabled: false,
        entity: 'Example',
        localId: 1
      }]
    });

    await wrapper.get('.official-sources-save-button').trigger('click');
    await flushPromises();

    expect(saveOfficialSources).toHaveBeenCalledWith([{
      domain: 'example.org',
      enabled: false,
      entity: 'Example'
    }]);
    expect(wrapper.vm.sources).toEqual([]);
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });

  it('keeps editable state and shows a safe mutation failure', async () => {
    const internalError = new Error('database connection details');
    saveOfficialSources.mockRejectedValue(internalError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = mountOfficialSources();
    await flushPromises();
    await wrapper.setData({
      sources: [{
        domain: 'example.org',
        enabled: true,
        entity: 'Example',
        localId: 1
      }]
    });

    await wrapper.get('.official-sources-save-button').trigger('click');
    await flushPromises();

    expect(wrapper.get('.official-sources-message--error').text())
      .toBe('Could not save official sources. Please try again.');
    expect(wrapper.text()).not.toContain(internalError.message);
    expect(wrapper.vm.sources).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(
      'Error saving official sources:',
      internalError
    );
  });
});
