import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobilePullToRefresh from '../src/components/shell/MobilePullToRefresh.vue';
import mobilePullToRefreshSource from '../src/components/shell/MobilePullToRefresh.vue?raw';

// This function creates the shared mobile scroll root used by the gesture component.
const mountPullToRefresh = () => {
  document.body.innerHTML = '<div class="app-shell__main"><div id="pull-mount"></div><article id="article-target"></article></div>';
  return mount(MobilePullToRefresh, {
    attachTo: '#pull-mount',
    props: {
      scrollRoot: document.querySelector('.app-shell__main')
    },
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
  it('uses the semantic refresh-indicator layer without z-index arithmetic', () => {
    expect(mobilePullToRefreshSource).toContain('z-index: var(--layer-refresh-indicator);');
    expect(mobilePullToRefreshSource).not.toContain('calc(var(--layer-sticky) - 1)');
  });

  it('arms a vertical pull at the top and emits one refresh after release', async () => {
    const wrapper = mountPullToRefresh();
    const start = touchEvent({ y: 20 });
    const move = touchEvent({ y: 200 });

    wrapper.vm.handleTouchStart(start);
    wrapper.vm.handleTouchMove(move);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Release to refresh');
    expect(wrapper.classes()).toContain('mobile-pull-to-refresh--tracking');
    expect(wrapper.vm.indicatorStyle).not.toHaveProperty('height');
    expect(wrapper.vm.indicatorStyle['--pull-indicator-reveal']).toBe('46px');
    expect(document.querySelector('.app-shell__main').style.getPropertyValue('--mobile-pull-article-offset')).toBe('46px');
    expect(document.querySelector('.app-shell__main').style.getPropertyValue('--mobile-pull-article-duration')).toBe('0ms');
    expect(wrapper.emitted('show-mobile-toolbar')).toHaveLength(1);
    expect(move.preventDefault).toHaveBeenCalledOnce();

    wrapper.vm.handleTouchEnd();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('refresh')).toHaveLength(1);
    expect(wrapper.classes()).not.toContain('mobile-pull-to-refresh--tracking');
    expect(wrapper.text()).toContain('Refreshing articles');
    expect(document.querySelector('.app-shell__main').style.getPropertyValue('--mobile-pull-article-duration')).toBe('160ms');

    await wrapper.setProps({ refreshing: true });
    await wrapper.setProps({ refreshing: false });
    expect(wrapper.vm.indicatorHeight).toBe(0);
    expect(document.querySelector('.app-shell__main').style.getPropertyValue('--mobile-pull-article-offset')).toBe('0px');
    wrapper.unmount();
  });

  it('ignores short, horizontal, toolbar, and already-scrolled gestures', () => {
    const wrapper = mountPullToRefresh();
    const home = document.querySelector('.app-shell__main');

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

  it.each(['article-list-view--expanded', 'article-reader__list'])(
    'uses the %s scroll surface when the tablet layout owns scrolling',
    scrollRootClass => {
      const wrapper = mountPullToRefresh();
      const home = document.querySelector('.app-shell__main');
      const nestedScrollRoot = document.createElement('div');
      const nestedArticle = document.createElement('article');
      nestedScrollRoot.className = scrollRootClass;
      nestedScrollRoot.appendChild(nestedArticle);
      home.appendChild(nestedScrollRoot);

      nestedScrollRoot.scrollTop = 10;
      wrapper.vm.handleTouchStart(touchEvent({ target: nestedArticle }));
      expect(wrapper.vm.tracking).toBe(false);

      nestedScrollRoot.scrollTop = 0;
      wrapper.vm.handleTouchStart(touchEvent({ target: nestedArticle }));
      expect(wrapper.vm.tracking).toBe(true);
      expect(wrapper.vm.gestureScrollRoot).toBe(nestedScrollRoot);
      wrapper.unmount();
    }
  );

  it('shows refresh copy for a button-triggered refresh until the indicator collapses', async () => {
    vi.useFakeTimers();
    const wrapper = mountPullToRefresh();

    await wrapper.setProps({ refreshing: true });
    expect(wrapper.text()).toContain('Refreshing articles…');
    expect(wrapper.text()).not.toContain('Pull to refresh');

    await wrapper.setProps({ refreshing: false });
    expect(wrapper.text()).toContain('Articles refreshed');

    await vi.advanceTimersByTimeAsync(160);
    expect(wrapper.text()).toContain('Pull to refresh');
    wrapper.unmount();
    vi.useRealTimers();
  });
});
