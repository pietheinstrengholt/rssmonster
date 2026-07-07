import { describe, expect, it } from 'vitest';

import extractLeadImage from '../utils/extractLeadImage.js';

describe('extractLeadImage', () => {
  it('preserves an existing safe lead image', () => {
    const result = extractLeadImage({
      entry: {
        image: 'https://cdn.example/json-feed-image.jpg'
      },
      content: '<img src="https://cdn.example/content-image.jpg">',
      articleUrl: 'https://news.example/posts/1',
      existingLeadImage: 'https://cdn.example/enclosure.jpg'
    });

    expect(result).toBe('https://cdn.example/enclosure.jpg');
  });

  it('uses JSON Feed image fields before HTML content', () => {
    const result = extractLeadImage({
      entry: {
        banner_image: '/images/banner.jpg'
      },
      content: '<img src="https://cdn.example/content-image.jpg">',
      articleUrl: 'https://news.example/posts/1'
    });

    expect(result).toBe('https://news.example/images/banner.jpg');
  });

  it('extracts the largest meaningful image from content HTML', () => {
    const result = extractLeadImage({
      entry: {},
      content: `
        <p><img src="/tiny.jpg" width="80" height="60"></p>
        <p><img data-original="/feature.jpg" width="1200" height="675"></p>
      `,
      description: '<img src="https://cdn.example/description.jpg">',
      articleUrl: 'https://news.example/posts/1'
    });

    expect(result).toBe('https://news.example/feature.jpg');
  });

  it('falls back to description HTML when content has no image', () => {
    const result = extractLeadImage({
      entry: {},
      content: '<p>No image here.</p>',
      description: '<p><img data-lazy-src="../lead.jpg"></p>',
      articleUrl: 'https://news.example/posts/1'
    });

    expect(result).toBe('https://news.example/lead.jpg');
  });

  it('supports srcset attributes and rejects unsafe image URLs', () => {
    const result = extractLeadImage({
      entry: {
        image: 'data:image/png;base64,AAAA'
      },
      content: `
        <img src="data:image/png;base64,AAAA">
        <img srcset="/small.jpg 320w, /large.jpg 1200w">
      `,
      articleUrl: 'https://news.example/posts/1'
    });

    expect(result).toBe('https://news.example/large.jpg');
  });

  it('rejects likely tracking images', () => {
    const result = extractLeadImage({
      entry: {
        thumbnail: 'https://analytics.example/pixel.gif'
      },
      content: `
        <img src="https://cdn.example/tracking.gif" width="1" height="1">
        <img src="https://cdn.example/article.jpg" width="900" height="500">
      `,
      articleUrl: 'https://news.example/posts/1'
    });

    expect(result).toBe('https://cdn.example/article.jpg');
  });

  it('returns null when no safe image is available', () => {
    const result = extractLeadImage({
      entry: {
        image: 'ftp://example.com/image.jpg'
      },
      content: '<img src="javascript:alert(1)">',
      description: '<img src="data:image/png;base64,AAAA">',
      articleUrl: 'https://news.example/posts/1'
    });

    expect(result).toBeNull();
  });
});
