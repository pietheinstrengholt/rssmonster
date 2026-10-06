import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Article from '../src/components/articles/Article.vue';
import { createFocusedStores } from './helpers/focusedStores.js';

const wrappers = [];
const audioMedia = { type: 'audio', url: 'https://example.com/episode.mp3', mimeType: 'audio/mpeg' };

function mountArticle(viewMode, props = {}) {
  const stores = createFocusedStores({
    overview: { categories: [] },
    selection: { currentSelection: { viewMode, grouping: 'none' } }
  });
  const wrapper = mount(Article, {
    props: {
      id: 42, title: 'An episode', url: 'https://example.com/article',
      content: '<p>Episode notes.</p>', feed: { feedName: 'The Daily' },
      media: audioMedia, ...props
    },
    global: { plugins: [stores.pinia] }
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('Article audio presentation', () => {
  it.each([
    ['full', false, true], ['reader', false, true],
    ['minimal', false, false], ['minimal', true, true],
    ['summarized', false, false], ['summaryBullets', false, false]
  ])('indicates audio and respects %s media gating with expansion %s', (viewMode, isMinimalContentOpen, hasPlayer) => {
    const wrapper = mountArticle(viewMode, { isMinimalContentOpen });
    expect(wrapper.find('[aria-label="Audio article"]').exists()).toBe(true);
    expect(wrapper.find('audio').exists()).toBe(hasPlayer);
    expect(wrapper.find('select[aria-label="Playback speed"]').exists()).toBe(hasPlayer);
  });

  it.each([true, false])('indicates audio in the minimal list with mobile layout %s', isMobile => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: isMobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const wrapper = mountArticle('minimal');
    expect(wrapper.find('[aria-label="Audio article"]').exists()).toBe(true);
    expect(wrapper.find('audio').exists()).toBe(false);
  });

  it.each(['full', 'minimal'])('only indicates safe playable structured audio in %s', async viewMode => {
    const wrapper = mountArticle(viewMode);
    for (const media of [
      null,
      { type: 'video', url: 'https://example.com/movie.mp4' },
      { type: 'audio', url: 'javascript:alert(1)' },
      { type: 'audio', url: audioMedia.url, sources: [{ url: 'javascript:alert(1)' }] }
    ]) {
      await wrapper.setProps({ media });
      expect(wrapper.find('[aria-label="Audio article"]').exists()).toBe(false);
      expect(wrapper.find('audio').exists()).toBe(false);
    }
    await wrapper.setProps({ media: { type: 'audio', sources: [{ url: audioMedia.url }] } });
    expect(wrapper.find('[aria-label="Audio article"]').exists()).toBe(true);
  });
});
