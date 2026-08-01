import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobilePullToRefresh from '../src/components/shell/MobilePullToRefresh.vue';

// This function creates the shared mobile scroll root used by the gesture component.
const mountPullToRefresh = () => {
  document.body.innerHTML = '<div id="home"><div id="pull-mount"></div><article id="article-target"></article></div>';
  return mount(MobilePullToRefresh, {
    attachTo: '#pull-mount',
    global: {
      stubs: {
        BootstrapIcon: {
          template: '<span class="bootstrap-icon-stub"></span>'
        }
      }
    }
  });
};

// This function creates one touch event shape with controllable coordinates and cancellation.
const touchEvent = ({ x = 20, y = 20, target, cancelable = true } = {}) => ({
  cancelable,
  preventDefault: vi.fn(),
  target: target || document.getElementById('article-target'),
  touches: [{ clientX: x, clientY: y }]
});

beforeEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('MobilePullToRefresh', () => {
  it('arms a vertical pull at the top and emits one refresh after release', async () => {
    const wrapper = mountPullToRefresh();
    const start = touchEvent({ y: 20 });
    const move = touchEvent({ y: 200 });

    wrapper.vm.handleTouchStart(start);
    wrapper.vm.handleTouchMove(move);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Release to refresh');
    expect(move.preventDefault).toHaveBeenCalledOnce();

    wrapper.vm.handleTouchEnd();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.text()).toContain('Refreshing articles');

    await wrapper.setProps({ refreshing: true });
    await wrapper.setProps({ refreshing: false });
    expect(wrapper.vm.indicatorHeight).toBe(0);
    wrapper.unmount();
  });

  it('ignores short, horizontal, toolbar, and already-scrolled gestures', () => {
    const wrapper = mountPullToRefresh();
    const home = document.getElementById('home');

    wrapper.vm.handleTouchStart(touchEvent());
    wrapper.vm.handleTouchMove(touchEvent({ x: 180, y: 28 }));
    wrapper.vm.handleTouchEnd();

    wrapper.vm.handleTouchStart(touchEvent());
    wrapper.vm.handleTouchMove(touchEvent({ y: 80 }));
    wrapper.vm.handleTouchEnd();

    const toolbar = document.createElement('div');
    toolbar.className = 'mobile-toolbar-container';
    const toolbarButton = document.createElement('button');
    toolbar.appendChild(toolbarButton);
    home.appendChild(toolbar);
    wrapper.vm.handleTouchStart(touchEvent({ target: toolbarButton }));

    home.scrollTop = 10;
    wrapper.vm.handleTouchStart(touchEvent());

    expect(wrapper.emitted('refresh')).toBeUndefined();
    expect(wrapper.vm.tracking).toBe(false);
    wrapper.unmount();
  });
});
