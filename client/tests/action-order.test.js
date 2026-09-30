import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsActions from '../src/components/settings/SettingsActions.vue';
import { fetchActions, saveActions } from '../src/api/actions';

vi.mock('../src/api/actions', () => ({ fetchActions: vi.fn(), saveActions: vi.fn(), previewAction: vi.fn() }));
let wrapper;
afterEach(() => { wrapper?.unmount(); });
const button = label => wrapper.findAll('button').find(item => item.attributes('aria-label') === label || item.text() === label);
const names = () => wrapper.findAll('input[placeholder="Action name"]').map(input => input.element.value);
const load = async () => {
  fetchActions.mockResolvedValueOnce({ data: { actions: ['First', 'Second'].map(name => ({ name, actionType: 'favorite', regularExpression: '/topic/i', tagValue: '' })) } });
  wrapper = mount(SettingsActions, { attachTo: document.body, global: { stubs: { BootstrapIcon: true } } });
  await flushPromises();
};

describe('action priority controls', () => {
  it('moves rules with their editor state, keeps keyboard focus, and saves the displayed order', async () => {
    await load();
    expect(button('Move First up').attributes('disabled')).toBeDefined();
    expect(button('Move Second down').attributes('disabled')).toBeDefined();
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true);
    button('Move First down').element.focus();
    await button('Move First down').trigger('click');
    expect(names()).toEqual(['Second', 'First']);
    expect(wrapper.findAll('input[type="checkbox"]').map(input => input.element.checked)).toEqual([false, true]);
    expect(document.activeElement).toBe(button('Reorder First').element);
    expect(wrapper.get('[role="status"]').text()).toContain('position 2 of 2');
    saveActions.mockResolvedValueOnce({ data: { saved: true } });
    await button('Save Changes').trigger('click');
    await flushPromises();
    expect(saveActions.mock.calls.at(-1)[0].map(action => action.name)).toEqual(['Second', 'First']);
  });

  it('supports arrow keys on handles and retains reordered drafts when saving fails', async () => {
    await load();
    const handle = button('Reorder Second');
    handle.element.focus();
    await handle.trigger('keydown', { key: 'ArrowUp' });
    expect(names()).toEqual(['Second', 'First']);
    expect(document.activeElement).toBe(handle.element);
    await handle.trigger('keydown', { key: 'ArrowUp' });
    expect(names()).toEqual(['Second', 'First']);
    saveActions.mockRejectedValueOnce(new Error('offline'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await button('Save Changes').trigger('click');
    await flushPromises();
    expect(names()).toEqual(['Second', 'First']);
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save');
    log.mockRestore();
  });
});
