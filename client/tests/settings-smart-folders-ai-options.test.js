import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettingsSmartFolders from '../src/components/settings/SettingsSmartFolders.vue';
import SmartFolderEditor from '../src/components/settings/smartFolders/SmartFolderEditor.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderInsights: vi.fn(),
  saveSmartFolders: vi.fn()
}));

// This function mounts Smart Folder settings after its authoritative load completes.
const mountSettings = async (AIEnabled) => {
  const stores = createFocusedStores({
    auth: { token: 'test-token' },
    overview: {
      fetchSmartFolders: vi.fn().mockResolvedValue(),
      smartFolders: [{ id: 1, name: 'Unread', query: 'unread:true limit:50', limitCount: 50 }]
    },
    selection: { currentSelection: { AIEnabled } }
  });
  const wrapper = mount(SettingsSmartFolders, {
    global: {
      plugins: [stores.pinia],
      stubs: {
        BootstrapIcon: true
      }
    }
  });
  await flushPromises();
  return wrapper;
};

// This function opens the first Smart Folder configuration form.
const openFirstFolder = async (wrapper) => {
  await wrapper.get('.smart-folder-row').trigger('click');
};

// This function returns the labels from the sorting dropdown only.
const getSortOptionLabels = (wrapper) => {
  const sortField = wrapper.findAll('label.smart-folder-field')
    .find(field => field.text().startsWith('Sort by'));

  return sortField.findAll('option').map(option => option.text());
};

describe('SettingsSmartFolders AI options', () => {
  it('hides AI-dependent filters and sorts when AI is disabled', async () => {
    const wrapper = await mountSettings(false);
    await openFirstFolder(wrapper);

    const optionLabels = getSortOptionLabels(wrapper);

    expect(wrapper.text()).not.toContain('Quality & Scores');
    expect(wrapper.text()).not.toContain('Events & Clusters');
    expect(optionLabels).toEqual([
      'None',
      'Published date (newest)',
      'Published date (oldest)'
    ]);
  });

  it('shows AI-dependent filters and sorts when AI is enabled', async () => {
    const wrapper = await mountSettings(true);
    await openFirstFolder(wrapper);

    const optionLabels = getSortOptionLabels(wrapper);

    expect(wrapper.text()).toContain('Quality & Scores');
    expect(wrapper.text()).toContain('Events & Clusters');
    expect(optionLabels).toEqual([
      'None',
      'Published date (newest)',
      'Published date (oldest)',
      'Top Stories',
      'Recommended',
      'Quality'
    ]);
    expect(optionLabels).not.toContain('Most Engaged');
  });

  it('creates non-AI folders without a hidden AI sort', async () => {
    const wrapper = await mountSettings(false);

    await wrapper.get('.smart-folders-list-header .settings-add-button').trigger('click');

    expect(wrapper.vm.smartFolders.at(-1).query).toBe('limit:50');
    expect(wrapper.findComponent(SmartFolderEditor).vm.generatedSmartFolderQuery).toBe('limit:50');
  });
});
