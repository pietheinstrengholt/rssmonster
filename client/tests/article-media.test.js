import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ArticleMedia from '../src/components/articles/ArticleMedia.vue';

// This function mounts a video poster with representative feed metadata.
function mountArticleMedia(props = {}) {
  return mount(ArticleMedia, {
    props: {
      media: {
        type: 'video',
        provider: 'nu.nl',
        url: 'https://www.nu.nl/video/123',
        thumbnailUrl: 'https://media.nu.nl/thumbnail.jpg',
        durationSeconds: 142
      },
      articleUrl: 'https://www.nu.nl/article/123',
      imageUrl: 'https://media.nu.nl/article.jpg',
      title: 'News video',
      ...props
    }
  });
}

describe('ArticleMedia', () => {
  it('renders a linked video poster without an inline player', async () => {
    const wrapper = mountArticleMedia();
    const link = wrapper.get('a.article-media-link');

    expect(link.attributes('href')).toBe('https://www.nu.nl/video/123');
    expect(link.attributes('target')).toBe('_blank');
    expect(wrapper.get('img').attributes('src')).toBe('https://media.nu.nl/thumbnail.jpg');
    expect(wrapper.get('.article-media-badge').text()).toBe('Video');
    expect(wrapper.get('.article-media-metadata').text()).toBe('NU.nl · 2:22');
    expect(wrapper.find('.article-media-play').exists()).toBe(true);
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);

    await link.trigger('click');
    expect(wrapper.emitted('media-clicked')).toHaveLength(1);
  });

  it('falls back to the article URL and lead image when feed media URLs are unsafe', () => {
    const wrapper = mountArticleMedia({
      media: {
        type: 'video',
        url: 'javascript:alert(1)',
        thumbnailUrl: 'data:text/html,unsafe'
      }
    });

    expect(wrapper.get('a').attributes('href')).toBe('https://www.nu.nl/article/123');
    expect(wrapper.get('img').attributes('src')).toBe('https://media.nu.nl/article.jpg');
  });

  it('does not render unsupported media as an arbitrary player', () => {
    const wrapper = mountArticleMedia({
      media: {
        type: 'audio',
        url: 'https://media.example/audio.mp3'
      }
    });

    expect(wrapper.find('.article-media').exists()).toBe(false);
    expect(wrapper.find('audio').exists()).toBe(false);
  });
});
