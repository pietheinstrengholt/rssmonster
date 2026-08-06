import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppDropdown from '../src/components/shared/AppDropdown.vue';

const DropdownHarness = {
  components: { AppDropdown },
  props: {
    align: {
      type: String,
      default: 'start'
    },
    closeKey: {
      type: String,
      default: ''
    },
    id: {
      type: String,
      default: 'test-dropdown'
    }
  },
  emits: ['select'],
  template: `
    <AppDropdown :id="id" :align="align" :close-key="closeKey">
      <template #trigger="{ triggerProps }">
        <button v-bind="triggerProps" type="button">Open</button>
      </template>
      <template #menu="{ menuProps }">
        <div v-bind="menuProps">
          <button type="button" class="app-dropdown__item" role="menuitem" @click="$emit('select', 'first')">First</button>
          <button type="button" class="app-dropdown__item" role="menuitem" disabled>Disabled</button>
          <button type="button" class="app-dropdown__item" role="menuitem" @click="$emit('select', 'last')">Last</button>
        </div>
      </template>
    </AppDropdown>
  `
};

const mountedWrappers = [];

// This function mounts an isolated dropdown into the document for focus and outside-click behavior.
const mountDropdown = (props = {}) => {
  const wrapper = mount(DropdownHarness, {
    attachTo: document.body,
    props
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

afterEach(() => {
  mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('application dropdown runtime boundary', () => {
  it('opens by click and closes after an enabled selection', async () => {
    const wrapper = mountDropdown();
    const trigger = wrapper.get('#test-dropdown');

    expect(trigger.attributes('aria-controls')).toBe('test-dropdown-menu');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.classes()).toContain('app-dropdown__trigger');
    expect(wrapper.get('.app-dropdown').exists()).toBe(true);
    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('#test-dropdown-menu').classes()).toEqual(expect.arrayContaining([
      'app-dropdown__menu',
      'app-dropdown__menu--align-start',
      'app-dropdown__menu--open'
    ]));

    await wrapper.findAll('[role="menuitem"]')[0].trigger('click');
    expect(wrapper.emitted('select')).toEqual([['first']]);
    expect(trigger.attributes('aria-expanded')).toBe('false');
  });

  it('opens by keyboard, skips disabled actions, navigates boundaries, and restores focus', async () => {
    const wrapper = mountDropdown();
    const trigger = wrapper.get('#test-dropdown');
    const items = wrapper.findAll('[role="menuitem"]');

    trigger.element.focus();
    await trigger.trigger('keydown', { key: 'Enter' });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(items[0].element);

    await items[0].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[2].element);
    await items[2].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0].element);
    await items[0].trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(items[2].element);
    await items[2].trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(items[0].element);

    await items[0].trigger('keydown', { key: 'Escape' });
    await wrapper.vm.$nextTick();
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger.element);
  });

  it('supports Space and directional opening from the trigger', async () => {
    const wrapper = mountDropdown();
    const trigger = wrapper.get('#test-dropdown');
    const items = wrapper.findAll('[role="menuitem"]');

    await trigger.trigger('keydown', { key: ' ' });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(items[0].element);
    await items[0].trigger('keydown', { key: 'Escape' });
    await wrapper.vm.$nextTick();

    await trigger.trigger('keydown', { key: 'ArrowUp' });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(items[2].element);
  });

  it('does not close or emit when a disabled action is clicked', async () => {
    const wrapper = mountDropdown();
    const trigger = wrapper.get('#test-dropdown');

    await trigger.trigger('click');
    await wrapper.findAll('[role="menuitem"]')[1].trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(trigger.attributes('aria-expanded')).toBe('true');
  });

  it('closes for outside pointer interaction and owning-view changes', async () => {
    const wrapper = mountDropdown();
    const trigger = wrapper.get('#test-dropdown');

    await trigger.trigger('click');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(trigger.attributes('aria-expanded')).toBe('false');

    await trigger.trigger('click');
    await wrapper.setProps({ closeKey: 'next-view' });
    expect(trigger.attributes('aria-expanded')).toBe('false');
  });

  it('keeps only one dropdown open across independent consumers', async () => {
    const first = mountDropdown({ id: 'first-dropdown' });
    const second = mountDropdown({ id: 'second-dropdown' });

    await first.get('#first-dropdown').trigger('click');
    await second.get('#second-dropdown').trigger('click');
    expect(first.get('#first-dropdown').attributes('aria-expanded')).toBe('false');
    expect(second.get('#second-dropdown').attributes('aria-expanded')).toBe('true');
  });

  it('removes global listeners when an open dropdown unmounts', async () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const wrapper = mountDropdown();

    await wrapper.get('#test-dropdown').trigger('click');
    wrapper.unmount();
    expect(addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
  });

  it('aligns to the requested edge and flips and clamps near viewport boundaries', async () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600);
    const wrapper = mountDropdown({ align: 'end' });
    const trigger = wrapper.get('#test-dropdown');
    const menu = wrapper.get('#test-dropdown-menu');
    vi.spyOn(trigger.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 580,
      height: 30,
      left: 250,
      right: 310,
      top: 550,
      width: 60,
      x: 250,
      y: 550,
      toJSON: () => ({})
    });
    vi.spyOn(menu.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 680,
      height: 100,
      left: 240,
      right: 340,
      top: 580,
      width: 100,
      x: 240,
      y: 580,
      toJSON: () => ({})
    });

    await trigger.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(menu.classes()).toContain('app-dropdown__menu--align-end');
    expect(menu.attributes('style')).toContain('bottom: 100%');
    expect(menu.attributes('style')).toContain('transform: translateX(-28px)');

    await wrapper.setProps({ id: 'test-dropdown', closeKey: 'close' });
    expect(trigger.attributes('aria-expanded')).toBe('false');
  });
});
