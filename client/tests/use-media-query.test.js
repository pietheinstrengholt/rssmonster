import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from '../src/composables/useMediaQuery.js';

// Mounts an Options API component that exposes one composable-owned query result.
const mountConsumer = (query = '(min-width: 880px)', fallback = false) => mount(defineComponent({
  // Exposes composable state without migrating the consumer away from the Options API.
  setup() {
    return { matches: useMediaQuery(query, fallback) };
  },
  template: '<span>{{ matches }}</span>'
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  // Verifies modern MediaQueryList state, updates, and cleanup share one handler.
  it('owns a modern media-query listener for the component lifetime', async () => {
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

    const wrapper = mountConsumer();
    expect(wrapper.text()).toBe('false');
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    const handler = mediaQuery.addEventListener.mock.calls[0][1];
    handler({ matches: true });
    await nextTick();
    expect(wrapper.text()).toBe('true');

    wrapper.unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', handler);
  });

  // Verifies older MediaQueryList implementations use their matching listener API.
  it('supports legacy media-query listeners', () => {
    const mediaQuery = {
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn()
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

    const wrapper = mountConsumer();
    const handler = mediaQuery.addListener.mock.calls[0][0];
    expect(wrapper.text()).toBe('true');

    wrapper.unmount();
    expect(mediaQuery.removeListener).toHaveBeenCalledWith(handler);
  });

  // Verifies unsupported environments resolve the caller-owned fallback without listeners.
  it('uses a lazy fallback when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const fallback = vi.fn(() => true);

    const wrapper = mountConsumer('(min-width: 768px)', fallback);

    expect(wrapper.text()).toBe('true');
    expect(fallback).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
