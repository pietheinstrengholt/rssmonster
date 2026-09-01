import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import OpmlImportPreview from '../src/components/dialogs/feeds/OpmlImportPreview.vue';

let wrapper;

const preview = {
  subscriptionCount: 4,
  categories: [{ name: 'News', subscriptionCount: 2 }],
  categoryOptions: [{
    name: 'News',
    alreadyExists: true,
    fromOpml: true
  }, {
    name: 'Archive',
    alreadyExists: true,
    fromOpml: false
  }],
  subscriptions: [{
    inputUrl: 'https://example.test/first',
    title: 'First feed',
    description: 'Original description',
    categoryName: 'News',
    connectionStatus: 'available'
  }, {
    inputUrl: 'https://example.test/second',
    title: 'Second feed',
    categoryName: 'News',
    alreadySubscribed: true,
    connectionStatus: 'not_checked'
  }, {
    inputUrl: 'https://example.test/loose',
    connectionStatus: 'temporarily_unavailable'
  }, {
    inputUrl: 'https://example.test/first#duplicate',
    title: 'First feed copy',
    duplicateInFile: true,
    connectionStatus: 'not_checked'
  }]
};

const mountPreview = (props = {}) => {
  wrapper = mount(OpmlImportPreview, {
    props: { preview, ...props },
    global: { stubs: { BootstrapIcon: true } }
  });
  return wrapper;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.style.overflow = '';
});

describe('OpmlImportPreview', () => {
  it('shows connection validation progress before preview data arrives', async () => {
    const dialog = mountPreview({
      preview: null,
      loading: true,
      checkedFeeds: 37,
      totalFeeds: 120
    });

    expect(dialog.get('[role="status"]').text())
      .toContain('Preparing your OPML preview');
    expect(dialog.text()).toContain('Checking subscription connections');
    expect(dialog.text()).toContain('37 of 120 feeds checked.');
    expect(dialog.find('.app-loading-indicator').exists()).toBe(true);
    expect(dialog.find('.opml-preview__table').exists()).toBe(false);
    expect(dialog.find('.base-dialog__button--primary').exists()).toBe(false);
    expect(dialog.get('.base-dialog__button--secondary').attributes('disabled'))
      .toBeDefined();
    await dialog.get('.base-dialog__button--secondary').trigger('click');
    expect(dialog.emitted('discard')).toBeUndefined();

    await dialog.setProps({ preview, loading: false });
    expect(dialog.find('.app-loading-indicator').exists()).toBe(false);
    expect(dialog.findAll('.opml-preview__table tbody tr')).toHaveLength(4);
    expect(dialog.findAll('input[type="checkbox"]')).toHaveLength(2);
    expect(dialog.get('.base-dialog__button--primary').text())
      .toBe('Import 2 subscriptions');
  });

  it('shows preview failures until the user closes the dialog', async () => {
    const dialog = mountPreview({
      preview: null,
      error: 'Could not preview this OPML file.'
    });

    expect(dialog.get('[role="alert"]').text())
      .toBe('Could not preview this OPML file.');
    expect(dialog.get('.base-dialog__button--secondary').text()).toBe('Close');
    expect(dialog.find('.base-dialog__button--primary').exists()).toBe(false);
    await dialog.get('.base-dialog__button--secondary').trigger('click');
    expect(dialog.emitted('discard')).toHaveLength(1);
  });

  it('shows the parsed subscriptions before confirmation', () => {
    const dialog = mountPreview();

    expect(dialog.text()).toContain('Preview OPML import');
    expect(dialog.text()).toContain('News');
    expect(dialog.text()).toContain('First feed');
    expect(dialog.text()).toContain('Original description');
    expect(dialog.text()).toContain('Uncategorized');
    expect(dialog.text()).toContain('https://example.test/loose');
    expect(dialog.text()).toContain('Already subscribed');
    expect(dialog.text()).toContain('Duplicate in file');
    expect(dialog.text()).toContain('Available');
    expect(dialog.text()).toContain('Temporarily unavailable');
    expect(dialog.find('.opml-preview__section').exists()).toBe(false);
    expect(dialog.findAll('.opml-preview__table tbody tr')).toHaveLength(4);
    expect(dialog.findAll('.opml-preview__row--skipped')).toHaveLength(2);
    expect(dialog.findAll('.opml-preview__status--available')).toHaveLength(1);
    expect(dialog.findAll('.opml-preview__status--warning')).toHaveLength(1);
    expect(dialog.findAll('.opml-preview__edit-description')).toHaveLength(2);
    expect(dialog.findAll('.opml-preview__edit-category')).toHaveLength(2);
    expect(dialog.find('textarea').exists()).toBe(false);
    expect(dialog.find('select').exists()).toBe(false);
    expect(dialog.get('.base-dialog__button--primary').text())
      .toBe('Import 2 subscriptions');
  });

  it('assigns existing, overlapping, and new categories from one row editor', async () => {
    const dialog = mountPreview();

    await dialog.findAll('.opml-preview__edit-category')[0].trigger('click');
    const firstSelect = dialog.get('.opml-preview__category-editor select');
    expect(firstSelect.text()).toContain('News — existing, in OPML');
    expect(firstSelect.text()).toContain('Archive — existing');
    expect(firstSelect.text()).toContain('Create new category…');
    expect(dialog.get('.base-dialog__button--primary').attributes('disabled'))
      .toBeDefined();
    await firstSelect.setValue('option:1');
    await dialog.get('.opml-preview__category-save').trigger('click');

    await dialog.findAll('.opml-preview__edit-category')[1].trigger('click');
    await dialog.get('.opml-preview__category-editor select').setValue('new');
    await dialog.get('input[aria-label="New category name"]')
      .setValue('  Research  ');
    await dialog.get('.opml-preview__category-save').trigger('click');

    await dialog.findAll('.opml-preview__edit-category')[0].trigger('click');
    expect(dialog.get('.opml-preview__category-editor select').text())
      .toContain('Research — new');
    await dialog.get('.opml-preview__category-cancel').trigger('click');
    await dialog.get('.base-dialog__button--primary').trigger('click');

    const confirmed = dialog.emitted('confirm')[0][0];
    expect(confirmed.subscriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        inputUrl: 'https://example.test/first',
        categoryName: 'Archive'
      }),
      expect.objectContaining({
        inputUrl: 'https://example.test/loose',
        categoryName: 'Research'
      })
    ]));
    expect(confirmed.categories).toEqual(expect.arrayContaining([
      { name: 'Archive', subscriptionCount: 1 },
      { name: 'Research', subscriptionCount: 1 }
    ]));
    expect(confirmed.categoryOptions).toContainEqual({
      name: 'Research',
      alreadyExists: false,
      fromOpml: false
    });
  });

  it('edits one feed description without turning every row into a form', async () => {
    const dialog = mountPreview();
    const editButtons = dialog.findAll('.opml-preview__edit-description');

    await editButtons[0].trigger('click');
    expect(dialog.findAll('textarea')).toHaveLength(1);
    expect(dialog.get('textarea').element.value).toBe('Original description');
    expect(dialog.get('.base-dialog__button--primary').attributes('disabled'))
      .toBeDefined();

    await dialog.get('textarea').setValue('  Updated feed description  ');
    await dialog.get('.opml-preview__description-save').trigger('click');
    expect(dialog.find('textarea').exists()).toBe(false);
    expect(dialog.text()).toContain('Updated feed description');

    await dialog.get('.base-dialog__button--primary').trigger('click');
    expect(dialog.emitted('confirm')[0][0].subscriptions[0]).toMatchObject({
      inputUrl: 'https://example.test/first',
      description: 'Updated feed description'
    });
  });

  it('emits confirmation and discard while idle', async () => {
    const dialog = mountPreview();
    const checkboxes = dialog.findAll('input[type="checkbox"]');

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every(checkbox => checkbox.element.checked)).toBe(true);
    await checkboxes[0].setValue(false);
    expect(dialog.get('.base-dialog__button--primary').text())
      .toBe('Import 1 subscription');

    await dialog.get('.base-dialog__button--primary').trigger('click');
    await dialog.get('.base-dialog__button--secondary').trigger('click');

    expect(dialog.emitted('confirm')).toHaveLength(1);
    expect(dialog.emitted('confirm')[0][0]).toMatchObject({
      subscriptionCount: 1,
      categories: [],
      subscriptions: [{
        inputUrl: 'https://example.test/first',
        selectedForImport: false
      }, {
        inputUrl: 'https://example.test/second',
        selectedForImport: false
      }, {
        inputUrl: 'https://example.test/loose',
        selectedForImport: true
      }, {
        inputUrl: 'https://example.test/first#duplicate',
        selectedForImport: false
      }]
    });
    expect(Object.hasOwn(
      dialog.emitted('confirm')[0][0].subscriptions[2],
      'description'
    )).toBe(false);
    expect(dialog.emitted('discard')).toHaveLength(1);
  });

  it('keeps the dialog locked and displays an import error while busy', async () => {
    const dialog = mountPreview({
      busy: true,
      error: 'Could not import these subscriptions.'
    });

    expect(dialog.get('[role="alert"]').text())
      .toBe('Could not import these subscriptions.');
    expect(dialog.get('.base-dialog__button--primary').attributes('disabled'))
      .toBeDefined();
    await dialog.get('.base-dialog__button--secondary').trigger('click');
    expect(dialog.emitted('discard')).toBeUndefined();
  });

  it('disables import when every subscription already exists', () => {
    const existingPreview = {
      subscriptionCount: 1,
      categories: [],
      subscriptions: [{
        inputUrl: 'https://example.test/existing',
        alreadySubscribed: true
      }]
    };
    const dialog = mountPreview({ preview: existingPreview });

    expect(dialog.get('.base-dialog__button--primary').text())
      .toBe('No new subscriptions');
    expect(dialog.get('.base-dialog__button--primary').attributes('disabled'))
      .toBeDefined();
  });
});
