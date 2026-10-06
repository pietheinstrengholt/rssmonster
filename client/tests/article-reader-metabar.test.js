import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { h, nextTick, ref } from 'vue';
import ArticleReaderMetabar from '../src/components/articles/ArticleReaderMetabar.vue';
import ArticleReaderBadge from '../src/components/articles/ArticleReaderBadge.vue';

let wrapper, resize, frames, paneWidth, widths;
const show = () => wrapper.find('button[aria-label="Show more article badges"]');
const panel = () => wrapper.get('[aria-label="More article badges"]');
const measure = async () => {
  for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  await nextTick();
};
const render = (label = ref('Badge one')) => {
  const clicked = vi.fn();
  wrapper = mount(ArticleReaderMetabar, {
    attachTo: document.body,
    attrs: { style: 'column-gap: 6px' },
    slots: {
      leading: () => h('span', 'Feed icon'),
      default: () => [label.value, 'Badge two', 'Badge three'].map((text, index) => h(ArticleReaderBadge, { key: index }, { default: () => h('button', { onClick: clicked }, text) }))
    }
  });
  return clicked;
};
const button = text => wrapper.findAll('button').find(item => item.text() === text);

beforeEach(() => {
  frames = new Map(); paneWidth = 400;
  widths = { 'Badge one': 110, 'Badge two': 90, 'Badge three': 80 };
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', callback => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => paneWidth);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return { width: this.style.maxWidth === 'none' ? (widths[this.textContent] || 200) : 22 };
  });
});
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Reader metadata overflow', () => {
  it('shows every badge without a disclosure when they fit', async () => {
    render(); await measure();
    expect(show().exists()).toBe(false);
    expect(panel().text()).toBe('');
  });

  it('moves only overflowing badges into the disclosure as space shrinks', async () => {
    const clicked = render(); await measure();
    paneWidth = 300; resize(); await measure();
    expect(show().attributes('aria-expanded')).toBe('false');
    expect(panel().text()).toBe('Badge three');
    paneWidth = 240; resize(); await measure();
    expect(panel().text()).toBe('Badge twoBadge three');
    expect(panel().text()).not.toContain('Badge one');
    await show().trigger('click');
    expect(panel().attributes('inert')).toBeUndefined();
    expect(document.activeElement.textContent).toBe('Badge two');
    await button('Badge two').trigger('click');
    expect(clicked).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(panel().attributes('inert')).toBeDefined();
    expect(document.activeElement).toBe(show().element);
    paneWidth = 400; resize(); await measure();
    expect(show().exists()).toBe(false);
    expect(panel().text()).toBe('');
  });

  it('keeps the first badge available even at very narrow widths', async () => {
    render(); paneWidth = 100; await measure();
    expect(panel().text()).toBe('Badge twoBadge three');
    expect(wrapper.find('[title="Badge one"]').exists()).toBe(true);
  });

  it('rechecks badge text changes and preserves their original order', async () => {
    const label = ref('Badge one'); render(label); await measure();
    label.value = 'A longer badge label';
    widths[label.value] = 260;
    await flushPromises(); await measure();
    expect(show().exists()).toBe(true);
    expect(panel().text()).toBe('Badge twoBadge three');
  });

  it('opens the overflow when a focused badge moves there', async () => {
    render(); await measure(); button('Badge two').element.focus();
    paneWidth = 240; resize(); await measure();
    expect(panel().attributes('inert')).toBeUndefined();
    expect(document.activeElement.textContent).toBe('Badge two');
  });
});
