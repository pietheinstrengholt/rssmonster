import { describe, expect, it } from 'vitest';

import processMedia from '../../services/crawl/processMedia.js';

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

  it('resolves a relative enclosure against the supplied article URL', () => {
    const media = processMedia({
      link: 'https://raw-feed.example/wrong-base',
      enclosures: [{
        url: '../media/video.mp4',
        type: 'video/mp4'
      }]
    }, null, 'https://publisher.example/articles/story');

    expect(media).toEqual(expect.objectContaining({
      type: 'video',
      url: 'https://publisher.example/media/video.mp4',
      mimeType: 'video/mp4'
    }));
  });

  it('resolves relative Media RSS URLs against one canonical page URL', () => {
    const media = processMedia({
      link: 'https://raw-feed.example/wrong-base',
      media: {
        contents: [{
          url: '../media/video.mp4',
          type: 'video/mp4',
          player: { url: '/players/video' },
          embed: { url: './embed/video' },
          thumbnails: [{ url: '../images/video.jpg' }]
        }]
      }
    }, null, 'https://publisher.example/articles/story');

    expect(media).toEqual(expect.objectContaining({
      type: 'video',
      url: 'https://publisher.example/media/video.mp4',
      embedUrl: 'https://publisher.example/articles/embed/video',
      thumbnailUrl: 'https://publisher.example/images/video.jpg',
      mimeType: 'video/mp4'
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

  it('normalizes YouTube media to stable allowlisted metadata', () => {
    const media = processMedia({
      link: 'https://www.youtube.com/watch?v=gZUDEBbZSp4',
      yt: { videoId: 'gZUDEBbZSp4' },
      media: {
        group: {
          title: { value: 'Raw group title' },
          description: { value: 'Promotional group description' },
          community: {
            statistics: { views: '31752' },
            starRating: { average: '5', count: '1488' }
          },
          thumbnails: [{ url: 'https://i.ytimg.com/vi/gZUDEBbZSp4/hqdefault.jpg' }],
          contents: [{
            url: 'https://www.youtube.com/v/gZUDEBbZSp4?version=3',
            type: 'application/x-shockwave-flash',
            duration: 142,
            width: 1280,
            height: 720,
            bitrate: 2500,
            title: { value: 'Raw media title' },
            description: { value: 'Promotional media description' },
            isLive: false
          }]
        }
      }
    });

    expect(media).toEqual(expect.objectContaining({
      type: 'video',
      provider: 'youtube',
      externalId: 'gZUDEBbZSp4',
      url: 'https://www.youtube.com/watch?v=gZUDEBbZSp4',
      embedUrl: 'https://www.youtube-nocookie.com/embed/gZUDEBbZSp4',
      thumbnailUrl: 'https://i.ytimg.com/vi/gZUDEBbZSp4/hqdefault.jpg',
      durationSeconds: 142,
      width: 1280,
      height: 720,
      isLive: false,
      views: 31752,
      rating: 5,
      ratingCount: 1488
    }));
    expect(media).not.toHaveProperty('title');
    expect(media).not.toHaveProperty('description');
    expect(media).not.toHaveProperty('community');
    expect(media).not.toHaveProperty('bitrate');
    expect(media).not.toHaveProperty('mimeType');
  });

  it('extracts a YouTube iframe before HTML cleanup removes the original embed', () => {
    const media = processMedia(
      {},
      '<iframe src="https://unknown.example/embed"></iframe>' +
      '<iframe src="//www.youtube.com/embed/gZUDEBbZSp4?start=10" width="640" height="360" ' +
      'data-thumbnail="/youtube-poster.jpg"></iframe>',
      'https://publisher.example/article'
    );

    expect(media).toEqual({
      type: 'video',
      provider: 'youtube',
      externalId: 'gZUDEBbZSp4',
      url: 'https://www.youtube.com/watch?v=gZUDEBbZSp4',
      embedUrl: 'https://www.youtube-nocookie.com/embed/gZUDEBbZSp4',
      thumbnailUrl: 'https://publisher.example/youtube-poster.jpg',
      width: 640,
      height: 360
    });
  });

  it('extracts a Vimeo iframe with dimensions and safe fallback metadata', () => {
    const media = processMedia(
      {},
      '<iframe src="https://player.vimeo.com/video/123456789?h=private" width="1280" ' +
      'height="720" poster="https://cdn.example/vimeo-poster.jpg"></iframe>',
      'https://publisher.example/article'
    );

    expect(media).toEqual({
      type: 'video',
      provider: 'vimeo',
      externalId: '123456789',
      url: 'https://vimeo.com/123456789',
      embedUrl: 'https://player.vimeo.com/video/123456789?h=private',
      thumbnailUrl: 'https://cdn.example/vimeo-poster.jpg',
      width: 1280,
      height: 720
    });
  });

  it('does not extract unknown or provider-lookalike iframes', () => {
    expect(processMedia(
      {},
      '<iframe src="https://youtube.com.attacker.example/embed/gZUDEBbZSp4"></iframe>' +
      '<iframe src="https://unknown.example/embed/123"></iframe>',
      'https://publisher.example/article'
    )).toBeNull();
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

  it('resolves relative gallery enclosures against the supplied article URL', () => {
    const media = processMedia({
      enclosures: [
        { url: './images/image-1.jpg', type: 'image/jpeg' },
        { url: '/shared/image-2.jpg', type: 'image/jpeg' }
      ]
    }, null, 'https://publisher.example/articles/story');

    expect(media.items.map(item => item.url)).toEqual([
      'https://publisher.example/articles/images/image-1.jpg',
      'https://publisher.example/shared/image-2.jpg'
    ]);
  });

  it('keeps gallery items compact and normalizes file size', () => {
    const media = processMedia({
      link: 'https://example.com/gallery',
      enclosures: [
        {
          url: 'https://example.com/image-1.jpg',
          type: 'image/jpeg',
          length: '220000',
          title: 'Raw title',
          community: { statistics: { views: 100 } }
        },
        {
          url: 'https://example.com/image-2.jpg',
          type: 'image/jpeg',
          fileSize: 210000,
          description: 'Raw description'
        }
      ]
    });

    expect(media.items).toEqual([
      { type: 'image', url: 'https://example.com/image-1.jpg', mimeType: 'image/jpeg', fileSize: 220000 },
      { type: 'image', url: 'https://example.com/image-2.jpg', mimeType: 'image/jpeg', fileSize: 210000 }
    ]);
    expect(media.items.every(item => !Object.hasOwn(item, 'length'))).toBe(true);
  });

  it('retains direct playable MIME types', () => {
    expect(processMedia({
      enclosures: [{ url: 'https://example.com/video.mp4', type: 'video/mp4' }]
    })).toHaveProperty('mimeType', 'video/mp4');
    expect(processMedia({
      enclosures: [{ url: 'https://example.com/audio.mp3', type: 'audio/mpeg' }]
    })).toHaveProperty('mimeType', 'audio/mpeg');
  });

  it('prefers and normalizes scalar community statistics', () => {
    const media = processMedia({
      media: {
        community: {
          statistics: { views: '10' },
          starRating: { average: '2', count: '3' }
        },
        group: {
          community: {
            statistics: { views: '20.9' },
            starRating: { average: '3.5', count: '4.9' }
          },
          contents: [{
            url: 'https://example.com/video.mp4',
            type: 'video/mp4',
            community: {
              statistics: { views: '30.9' },
              starRating: { average: '4.5', count: '5.9' }
            }
          }]
        }
      }
    });

    expect(media).toEqual(expect.objectContaining({ views: 30, rating: 4.5, ratingCount: 5 }));
  });

  it('omits invalid and negative community statistics', () => {
    const media = processMedia({
      media: {
        contents: [{
          url: 'https://example.com/video.mp4',
          type: 'video/mp4',
          community: {
            statistics: { views: 'invalid' },
            starRating: { average: -1, count: -2 }
          }
        }]
      }
    });

    expect(media).not.toHaveProperty('views');
    expect(media).not.toHaveProperty('rating');
    expect(media).not.toHaveProperty('ratingCount');
  });
});
