import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ConfirmDialog from '../src/components/dialogs/ConfirmDialog.vue';

let wrapper;

// This function mounts a representative destructive confirmation.
const mountConfirmDialog = (props = {}) => {
  wrapper = mount(ConfirmDialog, {
    props: {
      title: 'Delete item',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep item',
      ...props
    },
    slots: {
      default: 'This action cannot be undone.'
    }
  });

  return wrapper;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.style.overflow = '';
});

describe('ConfirmDialog', () => {
  // Verifies explicit confirmation, cancellation, and shell closure remain distinct events.
  it('emits its public confirmation and dismissal events', async () => {
    const dialogWrapper = mountConfirmDialog();

    await dialogWrapper.get('.confirm-dialog__confirm').trigger('click');
    await dialogWrapper.get('.confirm-dialog__cancel').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true
    }));

    expect(dialogWrapper.emitted('confirm')).toHaveLength(1);
    expect(dialogWrapper.emitted('cancel')).toHaveLength(1);
    expect(dialogWrapper.emitted('close')).toHaveLength(1);
    expect(dialogWrapper.get('.confirm-dialog__confirm').text()).toBe('Delete');
    expect(dialogWrapper.get('.confirm-dialog__confirm').classes()).toContain('app-button--danger');
    expect(dialogWrapper.get('.confirm-dialog__cancel').classes()).toContain('app-button--secondary');
  });

  // Verifies busy confirmations disable actions and ignore programmatic duplicate requests.
  it('blocks confirmation and dismissal while busy', async () => {
    const dialogWrapper = mountConfirmDialog({
      busy: true,
      variant: 'warning'
    });
    const confirmButton = dialogWrapper.get('.confirm-dialog__confirm');
    const cancelButton = dialogWrapper.get('.confirm-dialog__cancel');

    await confirmButton.trigger('click');
    await cancelButton.trigger('click');
    dialogWrapper.vm.requestConfirm();
    dialogWrapper.vm.requestCancel();
    dialogWrapper.vm.requestClose();

    expect(confirmButton.attributes('disabled')).toBeDefined();
    expect(cancelButton.attributes('disabled')).toBeDefined();
    expect(confirmButton.text()).toBe('Delete');
    expect(confirmButton.classes()).toContain('app-button--warning');
    expect(confirmButton.attributes('aria-busy')).toBe('true');
    expect(dialogWrapper.emitted('confirm')).toBeUndefined();
    expect(dialogWrapper.emitted('cancel')).toBeUndefined();
    expect(dialogWrapper.emitted('close')).toBeUndefined();
  });
});
