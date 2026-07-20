import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SettingsSmartFolders from '../src/components/model/SettingsSmartFolders.vue';

vi.mock('../src/api/client', () => ({
  setAuthToken: vi.fn()
}));

vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderInsights: vi.fn(),
  saveSmartFolders: vi.fn()
}));

// This function mounts Smart Folder settings with one editable folder.
const mountSettings = (AIEnabled) => mount(SettingsSmartFolders, {
  global: {
    mocks: {
      $store: {
        auth: { token: 'test-token' },
        data: {
          currentSelection: { AIEnabled },
          smartFolders: [{ id: 1, name: 'Unread', query: 'unread:true limit:50', limitCount: 50 }]
        }
      }
    },
    stubs: {
      BootstrapIcon: true
    }
  }
});

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
    const wrapper = mountSettings(false);
    await openFirstFolder(wrapper);

    const optionLabels = getSortOptionLabels(wrapper);

    expect(wrapper.text()).not.toContain('Quality & Scores');
    expect(wrapper.text()).not.toContain('Events & Clusters');
    expect(optionLabels).toEqual([
      'None',
      'Trust',
      'Published date (newest)',
      'Published date (oldest)'
    ]);
  });

  it('shows AI-dependent filters and sorts when AI is enabled', async () => {
    const wrapper = mountSettings(true);
    await openFirstFolder(wrapper);

    const optionLabels = getSortOptionLabels(wrapper);

    expect(wrapper.text()).toContain('Quality & Scores');
    expect(wrapper.text()).toContain('Events & Clusters');
    expect(optionLabels).toEqual(expect.arrayContaining([
      'Recommended',
      'Most Engaged',
      'Quality'
    ]));
  });

  it('creates non-AI folders without a hidden AI sort', async () => {
    const wrapper = mountSettings(false);

    await wrapper.get('.smart-folders-list-header .btn-add').trigger('click');

    expect(wrapper.vm.smartFolders.at(-1).query).toBe('limit:50');
    expect(wrapper.vm.generatedSmartFolderQuery).toBe('limit:50');
  });
});
