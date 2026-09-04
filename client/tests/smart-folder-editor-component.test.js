import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SmartFolderEditor from '../src/components/settings/smartFolders/SmartFolderEditor.vue';

// Mounts the extracted editor with an existing Smart Folder.
const mountEditor = (overrides = {}) => mount(SmartFolderEditor, {
  props: {
    smartFolder: {
      id: 1,
      name: 'Configured',
      query: 'read:true favorite:true firstSeen:12h title:"Daily Brief" '
        + 'quality:>=0.80 eventCount:>=4 sort:asc limit:75 "free phrase"',
      limitCount: 75
    },
    aiEnabled: true,
    ...overrides
  },
  global: {
    stubs: { BootstrapIcon: true }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SmartFolderEditor', () => {
  it('creates an isolated draft from the stored query', () => {
    const smartFolder = {
      id: 1,
      name: 'Configured',
      query: 'unread:true limit:50',
      limitCount: 50,
      markAsReadOnScroll: true
    };
    const wrapper = mountEditor({ smartFolder });

    expect(wrapper.vm.draftConfig).toMatchObject({
      name: 'Configured',
      limitCount: 50,
      markAsReadOnScroll: true,
      status: { unread: true, read: false }
    });

    wrapper.vm.draftConfig.name = 'Local edit';
    expect(smartFolder.name).toBe('Configured');
  });

  it('generates and validates the current editor query', () => {
    const wrapper = mountEditor();

    expect(wrapper.vm.generatedSmartFolderQuery).toBe(
      'read:true favorite:true firstSeen:12h title:"Daily Brief" '
      + '"free phrase" quality:>=0.80 eventCount:>=4 sort:asc limit:75'
    );
    expect(wrapper.vm.generatedQueryInvalid).toBe(false);
  });

  it('enables scrolling configuration only for unread folders and keeps it out of the query', async () => {
    const wrapper = mountEditor({
      smartFolder: {
        id: 1,
        name: 'Unread',
        query: 'unread:true limit:50',
        limitCount: 50,
        markAsReadOnScroll: true
      }
    });
    const scrollingCheckbox = wrapper.get('[name="markAsReadOnScroll"]');
    const unreadCheckbox = wrapper.findAll('input[type="checkbox"]')[0];

    expect(scrollingCheckbox.element.disabled).toBe(false);
    expect(scrollingCheckbox.element.checked).toBe(true);
    expect(wrapper.vm.generatedSmartFolderQuery).toBe('unread:true limit:50');

    await unreadCheckbox.setValue(false);

    expect(scrollingCheckbox.element.disabled).toBe(true);
    expect(scrollingCheckbox.element.checked).toBe(false);
    expect(wrapper.vm.draftConfig.markAsReadOnScroll).toBe(false);
  });

  it('shows scrolling configuration as disabled for a non-unread folder', () => {
    const wrapper = mountEditor();

    expect(wrapper.get('[name="markAsReadOnScroll"]').element.disabled).toBe(true);
    expect(wrapper.vm.draftConfig.markAsReadOnScroll).toBe(false);
  });

  it('enforces mutually exclusive status and event filters', () => {
    const wrapper = mountEditor();
    const config = wrapper.vm.draftConfig;

    config.status.unread = true;
    wrapper.vm.onStatusFilterChange('unread');
    expect(config.status.read).toBe(false);

    config.events.isNotEvent = true;
    config.events.useMinimumCount = true;
    config.events.isEvent = true;
    wrapper.vm.onEventFilterChange('isEvent');
    expect(config.events).toMatchObject({
      isEvent: true,
      isNotEvent: false,
      useMinimumCount: false
    });

    config.events.useMinimumCount = true;
    wrapper.vm.onEventFilterChange('useMinimumCount');
    expect(config.events.isEvent).toBe(false);
    expect(config.events.isNotEvent).toBe(false);
  });

  it('normalizes tag input and prevents unsupported separators', () => {
    const wrapper = mountEditor();
    const separatorEvent = { key: ',', preventDefault: vi.fn() };

    wrapper.vm.draftConfig.content.tags = 'machine learning';
    wrapper.vm.normalizeDraftTag();
    expect(wrapper.vm.draftConfig.content.tags).toBe('machine');

    wrapper.vm.preventTagSeparator(separatorEvent);
    expect(separatorEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it('emits semantic save, copy, cancel, and delete intents', async () => {
    const wrapper = mountEditor();
    wrapper.vm.draftConfig.name = 'Edited';

    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      name: 'Edited',
      limitCount: 75,
      markAsReadOnScroll: false
    });

    const buttons = wrapper.findAll('.smart-folder-config-actions button');
    await buttons[2].trigger('click');
    await buttons[1].trigger('click');
    await buttons[0].trigger('click');

    expect(wrapper.emitted('save-copy')?.[0]?.[0]).toMatchObject({
      name: 'Edited',
      markAsReadOnScroll: false
    });
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });

  it('copies the generated query when Clipboard support is available', async () => {
    const wrapper = mountEditor();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    await wrapper.vm.copyGeneratedQuery();

    expect(writeText).toHaveBeenCalledWith(wrapper.vm.generatedSmartFolderQuery);
  });
});
