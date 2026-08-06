import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import PreferencesDialogShell from '../src/components/dialogs/PreferencesDialogShell.vue';

let wrapper;

// Mounts the shell with a real external form to verify shared footer behavior.
const mountShell = (props = {}) => {
  wrapper = mount(PreferencesDialogShell, {
    props: {
      title: 'Preferences',
      description: 'Choose your preferences.',
      formId: 'preferences-form',
      ...props
    },
    slots: {
      default: '<form id="preferences-form"><input name="preference"></form>'
    },
    global: {
      stubs: {
        BootstrapIcon: true
      }
    }
  });

  return wrapper;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('PreferencesDialogShell', () => {
  // Verifies footer submission remains associated with the feature-owned form.
  it('associates its primary action with the owning feature form', () => {
    mountShell();

    const form = wrapper.get('#preferences-form');
    const primaryButton = wrapper.get('.preferences-dialog__button--primary');
    const secondaryButton = wrapper.get('.preferences-dialog__button--secondary');

    expect(primaryButton.attributes('form')).toBe('preferences-form');
    expect(primaryButton.element.form).toBe(form.element);
    expect(primaryButton.classes()).toEqual(expect.arrayContaining([
      'app-button',
      'app-button--primary'
    ]));
    expect(secondaryButton.classes()).toEqual(expect.arrayContaining([
      'app-button',
      'app-button--secondary'
    ]));
  });

  // Verifies the dialog close control uses the compact icon primitive and remains named.
  it('renders an accessibly named shared icon close control', () => {
    mountShell({ closeLabel: 'Close reading preferences' });

    const closeButton = wrapper.get('.base-dialog__close');

    expect(closeButton.classes()).toEqual(expect.arrayContaining([
      'app-icon-button',
      'app-icon-button--compact'
    ]));
    expect(closeButton.attributes('aria-label')).toBe('Close reading preferences');
  });

  // Verifies the shared saving rule blocks every user dismissal path.
  it('blocks close controls and Escape while saving', async () => {
    mountShell({ saving: true });

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true
    }));
    await wrapper.get('.base-dialog__close').trigger('click');
    await wrapper.get('.preferences-dialog__button--secondary').trigger('click');

    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.get('.base-dialog__close').attributes('disabled')).toBeDefined();
    expect(
      wrapper.get('.preferences-dialog__button--secondary').attributes('disabled')
    ).toBeDefined();
    expect(
      wrapper.get('.preferences-dialog__button--primary').attributes('disabled')
    ).toBeDefined();
    expect(
      wrapper.get('.preferences-dialog__button--primary').attributes('aria-busy')
    ).toBe('true');
  });
});
