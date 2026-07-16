import { describe, expect, it, vi } from 'vitest';

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      count: vi.fn(() => 0)
    }
  }
}));

const { default: detectArticleImage } = await import('../../services/crawl/media/detectArticleImage.js');
const { normalizeImageCandidates } = await import('../../services/feeds/feedsmith/normalizeMedia.js');

// This function adapts raw parser fixtures before exercising crawl-side image selection.
const detectImageFromFeedFixture = options => detectArticleImage({
  ...options,
  entry: {
    imageCandidates: normalizeImageCandidates(options.entry, options.articleUrl)
  }
});

describe('detectArticleImage', () => {
  it('prefers a large content image over feed candidates without useful dimensions', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {
        media: {
          contents: [
            {
              type: 'image/jpeg',
              url: 'https://cdn.example/media-content.jpg'
            }
          ],
          thumbnails: [
            {
              url: 'https://cdn.example/media-thumbnail.jpg'
            }
          ]
        },
        enclosures: [
          {
            type: 'image/png',
            url: 'https://cdn.example/enclosure.png'
          }
        ]
      },
      articleUrl: 'https://news.example/posts/1',
      contentHtml: '<img src="https://cdn.example/content.jpg" width="1200" height="675">'
    });

    expect(result).toEqual({
      url: 'https://cdn.example/content.jpg',
      width: 1200,
      height: 675,
      mimeType: null,
      source: 'content'
    });
  });

  it('prefers a stronger image enclosure over a thumbnail-shaped candidate', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {
        media: {
          group: {
            thumbnails: [
              {
                url: '/thumb.jpg'
              }
            ]
          }
        },
        enclosures: [
          {
            type: 'image/png',
            url: 'https://cdn.example/enclosure.png'
          }
        ]
      },
      articleUrl: 'https://news.example/posts/1'
    });

    expect(result).toEqual({
      url: 'https://cdn.example/enclosure.png',
      width: null,
      height: null,
      mimeType: 'image/png',
      source: 'enclosure'
    });
  });

  it('keeps the strongest dimensions when the same image appears in multiple sources', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {
        media: {
          thumbnails: [{
            url: 'https://cdn.example/shared-image.jpg',
            width: 120,
            height: 68
          }]
        }
      },
      articleUrl: 'https://news.example/posts/1',
      contentHtml: `
        <img
          src="https://cdn.example/shared-image.jpg"
          width="1200"
          height="675"
          alt="Shared article image"
        >
      `
    });

    expect(result).toEqual({
      url: 'https://cdn.example/shared-image.jpg',
      width: 1200,
      height: 675,
      mimeType: null,
      source: 'content'
    });
  });

  it('balances image position and dimensions within cleaned article content', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: `
        <p><img src="/logo.png" width="40" height="40" alt="Site logo"></p>
        <p><img src="/lead.jpg" width="900" height="500"></p>
        <p><img src="/later.jpg" width="1200" height="675"></p>
      `
    });

    expect(result).toEqual({
      url: 'https://news.example/later.jpg',
      width: 1200,
      height: 675,
      mimeType: null,
      source: 'content'
    });
  });

  it('does not hard-reject an editorial image based on natural-language alt text', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: `
        <img
          src="/new-ceo.jpg"
          width="1200"
          height="675"
          alt="Profile of the new CEO"
        >
      `
    });

    expect(result).toEqual({
      url: 'https://news.example/new-ceo.jpg',
      width: 1200,
      height: 675,
      mimeType: null,
      source: 'content'
    });
  });

  it.each([
    ['URL', '<img src="/brand-logo.png" width="1200" height="675" alt="Brand mark">'],
    ['class', '<img src="/brand-mark.png" class="site-icon" width="1200" height="675" alt="Brand mark">']
  ])('still hard-rejects a true logo or icon based on its %s', async (_signal, contentHtml) => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml
    });

    expect(result).toBeNull();
  });

  it('soft-penalizes decorative alt text without rejecting the image', async () => {
    const preferredResult = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: `
        <img src="/first.jpg" width="640" height="360" alt="Author profile">
        <img src="/second.jpg" width="640" height="360" alt="Editorial portrait">
      `
    });
    const fallbackResult = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: '<img src="/first.jpg" width="300" height="200" alt="Author profile">'
    });

    expect(preferredResult?.url).toBe('https://news.example/second.jpg');
    expect(fallbackResult?.url).toBe('https://news.example/first.jpg');
  });

  it('prefers the strongest valid srcset image over a fallback src', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: `
        <img
          src="/fallback-320.jpg"
          srcset="javascript:alert(1) 2400w, /responsive-640.jpg 640w, /responsive-1600.jpg 1600w"
          alt="Responsive article image"
        >
      `
    });

    expect(result).toEqual({
      url: 'https://news.example/responsive-1600.jpg',
      width: 1600,
      height: null,
      mimeType: null,
      source: 'content'
    });
  });

  it('scales responsive image height from the fallback aspect ratio', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: `
        <img
          src="/fallback-320.jpg"
          width="320"
          height="180"
          srcset="/responsive-640.jpg 640w, /responsive-1600.jpg 1600w"
        >
      `
    });

    expect(result).toEqual({
      url: 'https://news.example/responsive-1600.jpg',
      width: 1600,
      height: 900,
      mimeType: null,
      source: 'content'
    });
  });

  it('drops fallback height when a responsive width cannot be scaled safely', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: `
        <img
          src="/fallback.jpg"
          height="180"
          srcset="/responsive-1600.jpg 1600w"
        >
      `
    });

    expect(result).toEqual({
      url: 'https://news.example/responsive-1600.jpg',
      width: 1600,
      height: null,
      mimeType: null,
      source: 'content'
    });
  });

  it('prefers an explicit lazy source over a fallback src', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: '<img src="/fallback-320.jpg" data-original="/full-size.jpg">'
    });

    expect(result).toEqual({
      url: 'https://news.example/full-size.jpg',
      width: null,
      height: null,
      mimeType: null,
      source: 'content'
    });
  });

  it('returns metadata for the strongest body fallback candidate', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentHtml: '<p>No images here.</p>',
      content: `
        <figure>
          <img src="/small.jpg" width="120" height="90">
          <figcaption>Small unrelated image</figcaption>
        </figure>
        <figure>
          <img src="/climate-policy.jpg" width="1200" height="675">
          <figcaption>Climate policy leaders gathered in Brussels</figcaption>
        </figure>
      `,
      title: 'Climate policy leaders meet in Brussels'
    });

    expect(result).toEqual({
      url: 'https://news.example/climate-policy.jpg',
      width: 1200,
      height: 675,
      mimeType: null,
      source: 'content'
    });
  });

  it('returns null when no safe meaningful image is available', async () => {
    const result = await detectImageFromFeedFixture({
      entry: {
        media: {
          thumbnails: [
            {
              url: 'https://analytics.example/pixel.gif'
            }
          ]
        }
      },
      articleUrl: 'https://news.example/posts/1',
      contentHtml: '<img src="data:image/png;base64,AAAA">',
      content: '<img src="javascript:alert(1)">'
    });

    expect(result).toBeNull();
  });
});
