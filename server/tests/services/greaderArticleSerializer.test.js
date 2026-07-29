import { describe, expect, it } from 'vitest';
import {
  serializeGreaderArticle
} from '../../services/greader/articleSerializer.js';

const representativeArticle = {
  id: 26,
  feedId: 7,
  status: 'read',
  favoriteInd: 1,
  url: 'https://publisher.example/articles/café',
  title: 'Unicode — café ☕',
  author: 'Zoë Reporter',
  contentHtml: '<p>Safe café ☕</p>',
  contentOriginal: '<script>unsafe()</script>',
  createdAt: new Date('2037-12-31T23:59:58.123Z'),
  publishedAt: new Date('2042-01-02T03:04:05.678Z'),
  media: {
    type: 'audio',
    url: 'https://cdn.example/episode.mp3',
    mimeType: 'audio/mpeg',
    fileSize: 123456
  },
  feed: {
    id: 7,
    url: 'https://publisher.example/feed.xml',
    feedName: 'Publisher Feed',
    category: {
      name: 'Café / News'
    }
  }
};

describe('Google Reader article serializer', () => {
  it('matches the representative Google Reader response contract', () => {
    expect(serializeGreaderArticle(representativeArticle)).toEqual({
      id: 'tag:google.com,2005:reader/item/000000000000001a',
      crawlTimeMsec: '2145916798123',
      timestampUsec: '2272244645678000',
      published: 2272244645,
      title: 'Unicode — café ☕',
      summary: {
        content: '<p>Safe café ☕</p>'
      },
      canonical: [{
        href: 'https://publisher.example/articles/café'
      }],
      alternate: [{
        href: 'https://publisher.example/articles/café',
        type: 'text/html'
      }],
      categories: [
        'user/-/state/com.google/reading-list',
        'user/-/state/com.google/read',
        'user/-/state/com.google/starred',
        'user/-/label/Caf%C3%A9%20%2F%20News'
      ],
      origin: {
        streamId: 'feed/https%3A%2F%2Fpublisher.example%2Ffeed.xml',
        title: 'Publisher Feed',
        htmlUrl: ''
      },
      author: 'Zoë Reporter',
      enclosure: [{
        href: 'https://cdn.example/episode.mp3',
        type: 'audio/mpeg',
        length: '123456'
      }]
    });
  });

  it('serializes dates before and after 2038 as exact decimal strings', () => {
    const serialized = serializeGreaderArticle(representativeArticle);

    expect(serialized.crawlTimeMsec).toBe('2145916798123');
    expect(serialized.timestampUsec).toBe('2272244645678000');
    expect(serialized.published).toBe(2272244645);
  });

  it('handles null and invalid dates without NaN and emits only sanitized HTML', () => {
    const serialized = serializeGreaderArticle({
      ...representativeArticle,
      createdAt: null,
      publishedAt: 'not-a-date',
      contentHtml: null,
      description: '<script>descriptionPayload()</script>',
      media: null
    });

    expect(serialized.crawlTimeMsec).toBe('0');
    expect(serialized.timestampUsec).toBe('0');
    expect(serialized.published).toBe(0);
    expect(serialized.summary.content).toBe('');
    expect(serialized).not.toHaveProperty('enclosure');
    expect(JSON.stringify(serialized)).not.toContain('descriptionPayload');
  });

  it('deduplicates state/category entries and accepts integer-like favorites', () => {
    const serialized = serializeGreaderArticle({
      ...representativeArticle,
      status: 'unread',
      favoriteInd: '1',
      feed: {
        ...representativeArticle.feed,
        category: {
          name: 'Café / News'
        }
      }
    });

    expect(serialized.categories).toEqual([
      'user/-/state/com.google/reading-list',
      'user/-/state/com.google/starred',
      'user/-/label/Caf%C3%A9%20%2F%20News'
    ]);
  });
});
