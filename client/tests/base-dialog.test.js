import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import BaseDialog from '../src/components/dialogs/BaseDialog.vue';

let wrapper;

// This function mounts the shared dialog with representative accessible content and actions.
const mountBaseDialog = (options = {}) => {
  wrapper = mount(BaseDialog, {
    attachTo: document.body,
    props: options.props,
    slots: {
      title: 'Shared dialog',
      description: 'Shared dialog description',
      'header-actions': '<button class="header-action" type="button">Close</button>',
      default: '<button class="body-action" type="button">Body action</button>',
      footer: '<button class="footer-action" type="button">Footer action</button>'
    }
  });

  return wrapper;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('BaseDialog', () => {
  // Verifies the shared shell exposes labelled modal semantics and configurable sizing.
  it('connects its title and description to the dialog', () => {
    const dialogWrapper = mountBaseDialog({ props: { size: 'lg' } });
    const dialog = dialogWrapper.get('[role="dialog"]');
    const title = dialogWrapper.get('.base-dialog__title');
    const description = dialogWrapper.get('.base-dialog__description');

    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-labelledby')).toBe(title.attributes('id'));
    expect(dialog.attributes('aria-describedby')).toBe(description.attributes('id'));
    expect(dialog.classes()).toContain('base-dialog__panel--lg');
    expect(dialogWrapper.get('.header-action').exists()).toBe(true);
  });

  // Verifies callers receive the store-agnostic close event.
  it('emits a close request through its public method', () => {
    const dialogWrapper = mountBaseDialog();

    dialogWrapper.vm.requestClose();

    expect(dialogWrapper.emitted('close')).toHaveLength(1);
  });

  // Verifies Escape requests closure through the dialog's document-level keyboard handling.
  it('emits close when Escape is pressed', () => {
    const dialogWrapper = mountBaseDialog();

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true
    }));

    expect(dialogWrapper.emitted('close')).toHaveLength(1);
  });

  // Verifies focus enters the dialog, remains contained, and returns to the opener.
  it('manages initial, contained, and restored focus', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.appendChild(opener);
    opener.focus();
    const dialogWrapper = mountBaseDialog();
    await flushPromises();

    const firstElement = dialogWrapper.get('.header-action').element;
    const lastElement = dialogWrapper.get('.footer-action').element;
    expect(document.activeElement).toBe(firstElement);
    expect(document.body.style.overflow).toBe('hidden');

    lastElement.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true
    }));
    expect(document.activeElement).toBe(firstElement);

    firstElement.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(lastElement);

    dialogWrapper.unmount();
    wrapper = null;

    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });
});
