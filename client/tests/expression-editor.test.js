import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExpressionEditor from '../src/components/settings/shared/ExpressionEditor.vue';

const mountEditor = props => mount(ExpressionEditor, {
  props: { modelValue: '', ...props },
  global: { stubs: { BootstrapIcon: true } }
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue() }
  });
});

describe('ExpressionEditor', () => {
  it('edits and validates with the shared Smart Folder expression contract', async () => {
    const wrapper = mountEditor();

    await wrapper.get('textarea').setValue('quallity:>=0.8');
    await wrapper.setProps({ modelValue: 'quallity:>=0.8' });
    await wrapper.get('.expression-editor__meta button').trigger('click');

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['quallity:>=0.8']);
    expect(wrapper.get('[role="alert"]').text()).toContain('Did you mean "quality"?');
    expect(wrapper.get('textarea').attributes('aria-describedby')).toContain('-validation');
  });

  it('shows valid feedback when validation is requested by a parent form', () => {
    const wrapper = mountEditor({ modelValue: 'tag:security', forceValidation: true });

    expect(wrapper.get('[role="status"]').text()).toContain('Valid expression');
    expect(wrapper.get('textarea').attributes('aria-invalid')).toBe('false');
  });

  it('renders and copies a validated readonly expression preview', async () => {
    const wrapper = mountEditor({
      modelValue: 'unread:true limit:50',
      label: 'Generated query',
      readonly: true,
      copyable: true
    });

    expect(wrapper.get('code').text()).toBe('unread:true limit:50');
    await wrapper.get('button').trigger('click');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('unread:true limit:50');
    expect(wrapper.emitted('copied')).toEqual([['unread:true limit:50']]);
  });

  it('reports invalid readonly expressions and handles an unavailable clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    const wrapper = mountEditor({
      modelValue: 'quallity:0.8',
      readonly: true,
      copyable: true
    });

    expect(wrapper.get('code').classes()).toContain('input-invalid');
    expect(wrapper.get('[role="alert"]').text()).toContain('Did you mean "quality"?');
    await expect(wrapper.get('button').trigger('click')).resolves.toBeUndefined();
    expect(wrapper.emitted('copied')).toBeUndefined();
  });

  it('emits validation changes and hides manual feedback after further input', async () => {
    const wrapper = mountEditor({ modelValue: 'tag:security' });

    expect(wrapper.emitted('validation-change')?.[0]?.[0]).toMatchObject({ valid: true });
    await wrapper.get('.expression-editor__meta button').trigger('click');
    expect(wrapper.find('[role="status"]').exists()).toBe(true);

    await wrapper.get('textarea').setValue('tag:privacy');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await wrapper.setProps({ modelValue: 'quallity:0.8' });
    expect(wrapper.emitted('validation-change')?.at(-1)?.[0]).toMatchObject({
      valid: false,
      error: expect.stringContaining('quality')
    });
  });
});
