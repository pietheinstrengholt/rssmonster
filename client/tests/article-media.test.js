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
    expect(wrapper.get('img').attributes('loading')).toBe('lazy');
    expect(wrapper.get('img').attributes('decoding')).toBe('async');
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

  it('renders structured audio with native controls and no autoplay', () => {
    const wrapper = mountArticleMedia({
      media: {
        type: 'audio',
        provider: 'inline',
        url: 'https://media.example/audio.mp3',
        sources: [
          { url: 'https://media.example/audio.mp3', mimeType: 'audio/mpeg' },
          { url: 'javascript:alert(1)', mimeType: 'audio/mpeg' }
        ]
      }
    });

    const audio = wrapper.get('audio');
    expect(audio.attributes('controls')).toBeDefined();
    expect(audio.attributes('preload')).toBe('metadata');
    expect(audio.attributes('autoplay')).toBeUndefined();
    expect(wrapper.findAll('source')).toHaveLength(1);
    expect(wrapper.get('source').attributes('src')).toBe('https://media.example/audio.mp3');
    expect(wrapper.get('audio').text()).toContain('Listen to audio');
  });

  it('renders audio without a MIME type using the browser source fallback', () => {
    const wrapper = mountArticleMedia({
      media: { type: 'audio', url: 'https://media.example/episode' }
    });

    expect(wrapper.get('audio').attributes('autoplay')).toBeUndefined();
    expect(wrapper.get('source').attributes('src')).toBe('https://media.example/episode');
    expect(wrapper.get('source').attributes('type')).toBeUndefined();
  });

  it('renders inline video poster, multiple sources, and safe caption tracks', () => {
    const wrapper = mountArticleMedia({
      media: {
        type: 'video',
        provider: 'inline',
        url: 'https://cdn.example/movie.mp4',
        thumbnailUrl: 'https://cdn.example/poster.jpg',
        sources: [
          { url: 'https://cdn.example/movie.mp4', mimeType: 'video/mp4' },
          { url: 'https://cdn.example/movie.webm', mimeType: 'video/webm' }
        ],
        tracks: [
          { url: 'https://cdn.example/en.vtt', kind: 'captions', language: 'en' },
          { url: 'https://cdn.example/metadata.vtt', kind: 'metadata' }
        ]
      }
    });

    expect(wrapper.get('video').attributes('poster')).toBe('https://cdn.example/poster.jpg');
    expect(wrapper.findAll('source')).toHaveLength(2);
    expect(wrapper.findAll('track')).toHaveLength(1);
    expect(wrapper.get('track').attributes()).toMatchObject({
      src: 'https://cdn.example/en.vtt',
      kind: 'captions',
      srclang: 'en'
    });
    expect(wrapper.get('video').attributes('autoplay')).toBeUndefined();
  });

  it('renders direct video MIME variants with native controls while preserving provider posters', () => {
    const wrapper = mountArticleMedia({
      media: {
        type: 'video',
        url: 'https://cdn.example/movie.webm',
        mimeType: 'video/webm'
      }
    });

    expect(wrapper.get('video').attributes('controls')).toBeDefined();
    expect(wrapper.get('source').attributes('type')).toBe('video/webm');
    expect(wrapper.find('.article-media-link').exists()).toBe(false);
  });

  it('renders a safe gallery with accessible labels', () => {
    const wrapper = mountArticleMedia({
      media: {
        type: 'gallery',
        items: [
          { url: 'https://images.example/one.jpg', alt: 'A mountain' },
          { url: 'https://images.example/two.jpg' },
          { url: 'javascript:alert(1)' }
        ]
      }
    });

    expect(wrapper.get('.article-media-gallery').attributes('aria-label')).toBe('Image gallery: News video');
    expect(wrapper.findAll('.article-media-gallery-item')).toHaveLength(2);
    expect(wrapper.findAll('img').map(image => image.attributes('alt'))).toEqual([
      'A mountain',
      'News video, image 2'
    ]);
  });

  it('omits gallery images duplicated by the hero, article HTML, or another attachment', () => {
    const wrapper = mountArticleMedia({
      imageUrl: 'https://images.example/hero.jpg',
      contentHtml: '<p>Body</p><img src="https://images.example/body.jpg#publisher">',
      media: {
        type: 'gallery',
        items: [
          { url: 'https://images.example/hero.jpg' },
          { url: 'https://images.example/body.jpg' },
          { url: 'https://images.example/new.jpg' },
          { url: 'https://images.example/new.jpg#duplicate' }
        ]
      }
    });

    expect(wrapper.findAll('img')).toHaveLength(1);
    expect(wrapper.get('img').attributes('src')).toBe('https://images.example/new.jpg');
  });

  it('renders a non-duplicate single image and suppresses a duplicate lead image', async () => {
    const wrapper = mountArticleMedia({
      imageUrl: 'https://images.example/hero.jpg',
      media: { type: 'image', url: 'https://images.example/attachment.jpg' }
    });

    expect(wrapper.get('.article-media-image img').attributes('src')).toBe('https://images.example/attachment.jpg');
    await wrapper.setProps({ media: { type: 'image', url: 'https://images.example/hero.jpg' } });
    expect(wrapper.find('.article-media-image').exists()).toBe(false);
  });

  it('uses a safe fallback link for unsupported media and hides unsafe or empty payloads', async () => {
    const wrapper = mountArticleMedia({
      media: { type: 'document', url: 'https://cdn.example/attachment.pdf' }
    });

    expect(wrapper.get('.article-media-fallback a').attributes('href')).toBe('https://cdn.example/attachment.pdf');
    await wrapper.setProps({ media: { type: 'document', url: 'data:text/html,unsafe' } });
    expect(wrapper.find('.article-media-fallback').exists()).toBe(false);
    await wrapper.setProps({ media: {} });
    expect(wrapper.html()).toBe('<!--v-if-->');
  });
});
