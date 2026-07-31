import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import CategoryIconPicker from '../src/components/dialogs/categories/CategoryIconPicker.vue';

let wrapper;

// This function mounts the icon picker with a selected icon and browser focus support.
const mountIconPicker = (modelValue = 'folder-fill') => {
  wrapper = mount(CategoryIconPicker, {
    attachTo: document.body,
    props: { modelValue },
    global: {
      stubs: { BootstrapIcon: true }
    }
  });

  return wrapper;
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('CategoryIconPicker', () => {
  // Verifies click selection follows the component's v-model event contract.
  it('emits the selected icon through update:modelValue', async () => {
    const picker = mountIconPicker();

    await picker.get('[aria-label="Technology"]').trigger('click');

    expect(picker.emitted('update:modelValue')).toEqual([['cpu-fill']]);
  });

  // Verifies unsupported persisted icons display the established accessible folder fallback.
  it('renders the folder fallback with radio-group semantics', () => {
    const picker = mountIconPicker('unsupported-icon');
    const group = picker.get('[role="radiogroup"]');
    const folder = picker.get('[aria-label="Folder"]');

    expect(group.attributes('aria-label')).toBe('Category icon');
    expect(folder.attributes('role')).toBe('radio');
    expect(folder.attributes('aria-checked')).toBe('true');
    expect(folder.attributes('tabindex')).toBe('0');
    expect(picker.get('[aria-label="Technology"]').attributes('tabindex')).toBe('-1');
  });

  // Verifies Arrow keys select and focus the next radio option.
  it('supports keyboard selection within the icon catalogue', async () => {
    const picker = mountIconPicker();
    const folder = picker.get('[aria-label="Folder"]');
    const newspaper = picker.get('[aria-label="Newspaper"]');
    folder.element.focus();

    await folder.trigger('keydown', { key: 'ArrowRight' });

    expect(picker.emitted('update:modelValue')).toEqual([['newspaper']]);
    expect(document.activeElement).toBe(newspaper.element);
  });
});
