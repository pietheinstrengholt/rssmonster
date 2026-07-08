import { describe, expect, it, vi } from 'vitest';

vi.mock('../models/index.js', () => ({
  default: {
    Article: {
      count: vi.fn(() => 0)
    }
  }
}));

const { default: detectArticleImage } = await import('../services/crawl/detectArticleImage.js');

describe('detectArticleImage', () => {
  it('uses media:content image before media:thumbnail, enclosure, and HTML', async () => {
    const result = await detectArticleImage({
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
      contentStripped: '<img src="https://cdn.example/content.jpg" width="1200" height="675">'
    });

    expect(result).toBe('https://cdn.example/media-content.jpg');
  });

  it('uses media:thumbnail before image enclosures', async () => {
    const result = await detectArticleImage({
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

    expect(result).toBe('https://news.example/thumb.jpg');
  });

  it('uses the first meaningful image near the top of cleaned article content', async () => {
    const result = await detectArticleImage({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentStripped: `
        <p><img src="/logo.png" width="40" height="40" alt="Site logo"></p>
        <p><img src="/lead.jpg" width="900" height="500"></p>
        <p><img src="/later.jpg" width="1200" height="675"></p>
      `
    });

    expect(result).toBe('https://news.example/lead.jpg');
  });

  it('scores body fallback candidates by size, aspect ratio, position, and title text', async () => {
    const result = await detectArticleImage({
      entry: {},
      articleUrl: 'https://news.example/posts/1',
      contentStripped: '<p>No images here.</p>',
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

    expect(result).toBe('https://news.example/climate-policy.jpg');
  });

  it('returns null when no safe meaningful image is available', async () => {
    const result = await detectArticleImage({
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
      contentStripped: '<img src="data:image/png;base64,AAAA">',
      content: '<img src="javascript:alert(1)">'
    });

    expect(result).toBeNull();
  });
});
