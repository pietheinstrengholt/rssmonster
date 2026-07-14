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
  it('makes every segment of legacy Mastodon-formatted links visible', () => {
    const wrapper = mountArticleContent(
      '<p>Article <a href="https://eff.org/summer" target="_blank" rel="nofollow noopener" translate="no">' +
      '<span class="invisible">https://</span><span class="">eff.org/summer</span>' +
      '<span class="invisible"></span></a></p>'
    );
    const content = wrapper.find('.article-full-content');

    expect(content.text()).toContain('https://eff.org/summer');
    expect(content.html()).not.toContain('invisible');
    expect(content.html()).not.toContain('class=""');
  });

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
