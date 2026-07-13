import { describe, expect, it } from 'vitest';

import processMedia from '../services/crawl/processMedia.js';

describe('processMedia', () => {
  it('returns null for a normal article with one JPEG enclosure', () => {
    expect(processMedia({
      link: 'https://www.engadget.com/article',
      title: 'Video | This is still a normal article',
      enclosures: [{ url: 'https://s.yimg.com/lead.jpg', type: 'image/jpeg' }]
    })).toBeNull();
  });

  it('creates a gallery from multiple distinct image enclosures', () => {
    const media = processMedia({
      link: 'https://example.com/article',
      enclosures: [
        { url: 'https://example.com/image-1.jpg', type: 'image/jpeg' },
        { url: 'https://example.com/image-2.jpg', type: 'image/jpeg' },
        { url: 'https://example.com/image-3.jpg', type: 'image/jpeg' }
      ]
    });

    expect(media).toEqual({
      type: 'gallery',
      url: 'https://example.com/article',
      thumbnailUrl: 'https://example.com/image-1.jpg',
      items: [
        { type: 'image', url: 'https://example.com/image-1.jpg', mimeType: 'image/jpeg' },
        { type: 'image', url: 'https://example.com/image-2.jpg', mimeType: 'image/jpeg' },
        { type: 'image', url: 'https://example.com/image-3.jpg', mimeType: 'image/jpeg' }
      ]
    });
  });

  it('deduplicates gallery images by normalized safe URL', () => {
    const media = processMedia({
      enclosures: [
        { url: 'https://EXAMPLE.com:443/image-1.jpg', type: 'image/jpeg' },
        { url: 'https://example.com/image-1.jpg', type: 'image/jpeg' },
        { url: 'https://example.com/image-2.jpg', type: 'image/jpeg' }
      ]
    });

    expect(media.items.map(item => item.url)).toEqual([
      'https://example.com/image-1.jpg',
      'https://example.com/image-2.jpg'
    ]);
  });

  it('uses a lone image enclosure as thumbnail for an NU.nl video route', () => {
    expect(processMedia({
      link: 'https://www.nu.nl/tech/123/video/voorbeeld.html',
      enclosures: [{ url: 'https://media.nu.nl/video-thumbnail.jpg', type: 'image/jpeg' }]
    })).toEqual({
      type: 'video',
      url: 'https://www.nu.nl/tech/123/video/voorbeeld.html',
      thumbnailUrl: 'https://media.nu.nl/video-thumbnail.jpg'
    });
  });

  it('normalizes an MP4 enclosure as video metadata', () => {
    expect(processMedia({
      link: 'https://example.com/video',
      enclosures: [{
        url: 'https://cdn.example.com/video.mp4',
        type: 'video/mp4',
        length: 123456
      }]
    })).toEqual(expect.objectContaining({
      type: 'video',
      url: 'https://cdn.example.com/video.mp4',
      mimeType: 'video/mp4',
      fileSize: 123456
    }));
  });

  it('normalizes an MP3 enclosure and MM:SS duration as audio metadata', () => {
    expect(processMedia({
      enclosures: [{ url: 'https://example.com/episode.mp3', type: 'audio/mpeg' }],
      itunes: { duration: '30:00' }
    })).toEqual(expect.objectContaining({
      type: 'audio',
      url: 'https://example.com/episode.mp3',
      mimeType: 'audio/mpeg',
      durationSeconds: 1800
    }));
  });

  it('normalizes HH:MM:SS duration and omits invalid duration values', () => {
    const valid = processMedia({
      enclosures: [{ url: 'https://example.com/long.mp3', type: 'audio/mpeg' }],
      itunes: { duration: '01:02:03' }
    });
    const invalid = processMedia({
      enclosures: [{ url: 'https://example.com/invalid.mp3', type: 'audio/mpeg' }],
      itunes: { duration: '01:75:99' }
    });

    expect(valid.durationSeconds).toBe(3723);
    expect(invalid).not.toHaveProperty('durationSeconds');
  });

  it('preserves YouTube provider and privacy-enhanced embed metadata', () => {
    const media = processMedia({
      link: 'https://www.youtube.com/watch?v=gZUDEBbZSp4',
      yt: { videoId: 'gZUDEBbZSp4' },
      media: {
        group: {
          thumbnails: [{ url: 'https://i.ytimg.com/vi/gZUDEBbZSp4/hqdefault.jpg' }],
          contents: [{
            url: 'https://www.youtube.com/v/gZUDEBbZSp4?version=3',
            type: 'application/x-shockwave-flash',
            duration: 142,
            width: 1280,
            height: 720,
            bitrate: 2500,
            isLive: false
          }]
        }
      }
    });

    expect(media).toEqual(expect.objectContaining({
      type: 'video',
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=gZUDEBbZSp4',
      embedUrl: 'https://www.youtube-nocookie.com/embed/gZUDEBbZSp4',
      thumbnailUrl: 'https://i.ytimg.com/vi/gZUDEBbZSp4/hqdefault.jpg',
      durationSeconds: 142,
      width: 1280,
      height: 720,
      isLive: false,
      bitrate: 2500
    }));
  });

  it('ignores malformed and unsafe candidate URLs', () => {
    expect(processMedia({
      link: 'https://example.com/article',
      enclosures: [
        { url: 'javascript:alert(1)', type: 'video/mp4' },
        { url: 'not a URL', type: 'image/jpeg' }
      ]
    })).toBeNull();
  });

  it('normalizes image/jpg gallery items to image/jpeg', () => {
    const media = processMedia({
      enclosures: [
        { url: 'https://example.com/image-1.jpg', type: 'image/jpg' },
        { url: 'https://example.com/image-2.jpg', type: 'image/jpg' }
      ]
    });

    expect(media.items.every(item => item.mimeType === 'image/jpeg')).toBe(true);
  });
});
