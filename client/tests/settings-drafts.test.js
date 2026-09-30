import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../src/components/settings/Settings.vue';
import { fetchActions, saveActions } from '../src/api/actions';
import { saveSmartFolders } from '../src/api/smartfolders';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/actions', () => ({ fetchActions: vi.fn(), saveActions: vi.fn() }));
vi.mock('../src/api/smartfolders', () => ({
  fetchSmartFolderInsights: vi.fn().mockResolvedValue({ data: { recommendations: [] } }),
  saveSmartFolders: vi.fn()
}));

let wrapper;
const button = label => wrapper.findAll('button').find(item => item.text().trim() === label);
const navigate = async label => {
  await button(label).trigger('click');
  await flushPromises();
};
const open = async (section, smartFolders = []) => {
  const stores = createFocusedStores({
    overview: { smartFolders, fetchSmartFolders: vi.fn().mockResolvedValue() }
  });
  wrapper = mount(Settings, { attachTo: document.body, props: { initialSection: section }, global: { plugins: [stores.pinia] } });
  await vi.waitFor(() => expect(button(section === 'actions' ? 'Add Action' : 'Add Smart Folder')).toBeDefined());
  await flushPromises();
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchActions.mockResolvedValue({ data: { actions: [{ name: 'Original', actionType: 'read', regularExpression: 'news' }] } });
  saveActions.mockResolvedValue({ data: {} });
  saveSmartFolders.mockImplementation(async folders => ({ data: { smartFolders: folders.map((folder, index) => ({ ...folder, id: index + 20 })) } }));
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });

describe('Settings drafts', () => {
  it('retains Actions across sections and protects closing from another section', async () => {
    await open('actions');
    await wrapper.get('#action-name-0').setValue('My edited action');
    await navigate('Welcome');
    await wrapper.get('[aria-label="Close settings"]').trigger('click');
    expect(wrapper.text()).toContain('You have unsaved changes');
    expect(wrapper.emitted('close')).toBeUndefined();
    await navigate('Keep editing');
    await navigate('Actions');
    expect(wrapper.get('#action-name-0').element.value).toBe('My edited action');
    await navigate('Save Changes');
    await wrapper.get('[aria-label="Close settings"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(saveActions).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'My edited action' })]));
  });

  it('requires explicit discard when Escape would close unsaved Actions', async () => {
    await open('actions');
    await wrapper.get('#action-name-0').setValue('Draft');
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toBeUndefined();
    await navigate('Discard changes');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(saveActions).not.toHaveBeenCalled();
  });

  it('retains an open Smart Folder draft and persists Save and close', async () => {
    await open('smartfolders');
    await navigate('Add Smart Folder');
    const name = wrapper.find('input[type="text"]');
    await name.setValue('Weekend reading');
    await navigate('Welcome');
    await navigate('Smart Folders');
    expect(wrapper.find('input[type="text"]').element.value).toBe('Weekend reading');
    await navigate('Save and close');
    expect(saveSmartFolders).toHaveBeenCalledOnce();
    expect(saveSmartFolders).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Weekend reading' })]));
    await navigate('Smart Folders');
    expect(wrapper.text()).toContain('Weekend reading');
    await wrapper.get('[aria-label="Close settings"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('protects edits inside an existing folder, including from another section', async () => {
    await open('smartfolders', [{ id: 7, name: 'Existing folder', query: 'unread:true limit:50', limitCount: 50 }]);
    const folderButton = wrapper.findAll('button').find(item => item.text().includes('Existing folder'));
    await folderButton.trigger('click');
    await wrapper.find('input[type="text"]').setValue('Changed folder');
    await navigate('Welcome');
    await wrapper.get('[aria-label="Close settings"]').trigger('click');
    expect(wrapper.text()).toContain('You have unsaved changes');
    expect(wrapper.emitted('close')).toBeUndefined();
    await navigate('Keep editing');
    await navigate('Smart Folders');
    await navigate('Save as copy');
    expect(saveSmartFolders).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'Changed folder copy' })]));
    await navigate('Smart Folders');
    expect(wrapper.text()).toContain('Changed folder copy');
  });

  it('closes unchanged folders without a discard warning', async () => {
    await open('smartfolders', [{ id: 7, name: 'Existing folder', query: 'unread:true limit:50', limitCount: 50 }]);
    await wrapper.findAll('button').find(item => item.text().includes('Existing folder')).trigger('click');
    await wrapper.get('[aria-label="Close settings"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('retains a failed folder save for retry and prevents closing while saving', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectSave;
    saveSmartFolders.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject; }));
    await open('smartfolders');
    await navigate('Add Smart Folder');
    await wrapper.find('input[type="text"]').setValue('Recoverable draft');
    await navigate('Save and close');
    expect(wrapper.get('[aria-label="Close settings"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toBeUndefined();
    rejectSave(new Error('Unavailable'));
    await flushPromises();
    expect(wrapper.text()).toContain('Your changes are still here');
    await navigate('Welcome');
    await navigate('Smart Folders');
    expect(wrapper.text()).toContain('Recoverable draft');
    await navigate('Retry');
    expect(saveSmartFolders).toHaveBeenCalledTimes(2);
    await wrapper.get('[aria-label="Close settings"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
