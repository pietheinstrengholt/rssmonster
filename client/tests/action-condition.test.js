import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ActionCondition from '../src/components/settings/ActionCondition.vue';
import SettingsActions from '../src/components/settings/SettingsActions.vue';
import { expressionPhrase, phraseExpression } from '../src/services/actionConditions.js';
import { fetchActions, previewAction, saveActions } from '../src/api/actions';

vi.mock('../src/api/actions', () => ({ fetchActions: vi.fn(), previewAction: vi.fn(), saveActions: vi.fn() }));
const editor = (expression = '') => mount(ActionCondition, {
  props: { id: 0, modelValue: expression, 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) }
});
let wrapper;

describe('plain-language action conditions', () => {
  it('treats regex punctuation literally and preserves phrases on reload', () => {
    for (const phrase of ['C++', 'a.b (test)', 'a/b', '$10 [sale]', 'back\\slash', 'climate change']) {
      const expression = phraseExpression(phrase);
      expect(expressionPhrase(expression)).toBe(phrase);
      expect(new RegExp(expression.slice(1, -2), 'i').test(phrase.toUpperCase())).toBe(true);
    }
    expect(expressionPhrase('/cat|dog/i')).toBeNull();
    expect(expressionPhrase('^Hello')).toBeNull();
  });

  it('previews an unsaved phrase, clears stale results on edits and offers retry without losing input', async () => {
    previewAction.mockResolvedValueOnce({ data: { checked: 25, matched: 1, articles: [{ id: 1, title: 'Learn C++' }] } });
    wrapper = editor();
    await wrapper.get('input[type="text"]').setValue('C++');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(previewAction).toHaveBeenCalledWith('/C\\+\\+/i');
    expect(wrapper.get('[role="status"]').text()).toContain('1 match among 25');
    expect(wrapper.text()).toContain('Learn C++');
    await wrapper.get('input[type="text"]').setValue('climate');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    previewAction.mockRejectedValueOnce(new Error('offline'));
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Your condition is still here');
    expect(wrapper.get('input[type="text"]').element.value).toBe('climate');
    previewAction.mockResolvedValueOnce({ data: { checked: 25, matched: 0, articles: [] } });
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('0 matches');
    wrapper.unmount();
  });

  it('ignores a preview that finishes after the condition changes', async () => {
    let resolve;
    previewAction.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    wrapper = editor('/hello/i');
    await wrapper.get('button').trigger('click');
    expect(wrapper.text()).toContain('Checking articles');
    await wrapper.get('input[type="text"]').setValue('new phrase');
    resolve({ data: { checked: 1, matched: 1, articles: [{ id: 1, title: 'Old result' }] } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Old result');
    wrapper.unmount();
  });

  it('keeps complex legacy conditions in Advanced and shows an empty library clearly', async () => {
    wrapper = editor('/cat|dog/i');
    expect(wrapper.get('input[type="checkbox"]').element.checked).toBe(true);
    expect(wrapper.get('input[type="text"]').element.value).toBe('/cat|dog/i');
    previewAction.mockResolvedValueOnce({ data: { checked: 0, matched: 0, articles: [] } });
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('No articles available');
    wrapper.unmount();
  });

  it('creates a Save article action with a phrase and persists its matching behavior', async () => {
    fetchActions.mockResolvedValueOnce({ data: { actions: [] } });
    saveActions.mockResolvedValueOnce({ data: { saved: true } });
    const view = mount(SettingsActions, { global: { stubs: { BootstrapIcon: true } } });
    await flushPromises();
    await view.findAll('button').find(button => button.text() === 'Add Action').trigger('click');
    expect(view.get('select').element.value).toBe('favorite');
    const save = view.findAll('button').find(button => button.text() === 'Save Changes');
    await save.trigger('click');
    expect(view.get('[role="alert"]').text()).toContain('enter a phrase');
    await view.get('#action-name-0').setValue('Keep C++');
    await view.get('#action-condition-0').setValue('C++');
    await save.trigger('click');
    await flushPromises();
    expect(saveActions).toHaveBeenCalledWith([{ name: 'Keep C++', actionType: 'favorite', regularExpression: '/C\\+\\+/i', tagValue: '' }]);
    expect(view.emitted('saved')).toHaveLength(1);
    view.unmount();
  });
});
