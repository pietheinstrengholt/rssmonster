import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ArticleContent from '../src/components/articles/ArticleContent.vue';

// This function mounts article content in a mode that renders full HTML.
function mountArticleContent(content) {
  return mount(ArticleContent, {
    props: {
      viewMode: 'full',
      content
    }
  });
}

describe('ArticleContent embeds', () => {
  it('renders rssmonster YouTube placeholders as iframe embeds', () => {
    const wrapper = mountArticleContent(`
      <p>Intro</p>
      <figure class="rssmonster-embed" data-provider="youtube" data-video-id="gZUDEBbZSp4"></figure>
    `);

    const iframe = wrapper.find('iframe.rssmonster-youtube-frame');

    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('src')).toBe('https://www.youtube.com/embed/gZUDEBbZSp4');
    expect(iframe.attributes('allowfullscreen')).toBeDefined();
  });

  it('renders legacy YouTube fallback links as iframe embeds', () => {
    const wrapper = mountArticleContent(`
      <figure class="embed embed-youtube"><a href="https://youtu.be/gZUDEBbZSp4">Watch on YouTube</a></figure>
    `);

    expect(wrapper.find('iframe.rssmonster-youtube-frame').attributes('src')).toBe('https://www.youtube.com/embed/gZUDEBbZSp4');
    expect(wrapper.text()).not.toContain('Watch on YouTube');
  });

  it('leaves invalid YouTube placeholders as fallback content', () => {
    const wrapper = mountArticleContent(`
      <figure class="rssmonster-embed" data-provider="youtube" data-video-id="javascript:alert(1)">
        <a href="https://example.com">Watch on YouTube</a>
      </figure>
    `);

    expect(wrapper.find('iframe.rssmonster-youtube-frame').exists()).toBe(false);
    expect(wrapper.text()).toContain('Watch on YouTube');
  });
});
