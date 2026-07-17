import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import buildArticlePersistenceValues, {
  selectMutableArticleSourceValues
} from '../../services/crawl/persistence/buildArticlePersistenceValues.js';

// This function returns the SHA-256 value expected for direct URL and content inputs.
const hashValue = value => createHash('sha256').update(value).digest('hex');

describe('buildArticlePersistenceValues', () => {
  it('maps shared create and update fields with explicit identities', () => {
    const values = buildArticlePersistenceValues(
      { id: 7, userId: 42 },
      {
        externalId: 'publisher-123',
        externalIdType: 'guid',
        link: 'https://example.com/article',
        leadImage: {
          url: 'https://cdn.example/lead.jpg',
          width: 1200,
          height: 675,
          mimeType: 'image/jpeg',
          source: 'content'
        },
        title: 'Article title',
        contentOriginal: '<p>Article body</p>',
        contentHtml: '<p>Article body</p>',
        contentText: 'Article body',
        published: new Date('2026-07-01T00:00:00Z'),
        publishInferred: false
      }
    );

    expect(values).toMatchObject({
      externalId: 'publisher-123',
      externalIdType: 'guid',
      userId: 42,
      feedId: 7,
      url: 'https://example.com/article',
      urlHash: hashValue('https://example.com/article'),
      normalizedUrl: 'https://example.com/article',
      normalizedUrlHash: hashValue('https://example.com/article'),
      imageUrl: 'https://cdn.example/lead.jpg',
      imageWidth: 1200,
      imageHeight: 675,
      imageMimeType: 'image/jpeg',
      imageSource: 'content',
      contentOriginal: '<p>Article body</p>',
      contentHtml: '<p>Article body</p>',
      contentText: 'Article body',
      contentSourceHash: hashValue('<p>Article body</p>'),
      contentTextHash: hashValue('Article body')
    });
  });

  it('selects only mutable publisher fields for updates', () => {
    const values = buildArticlePersistenceValues(
      { id: 7, userId: 42 },
      {
        externalId: 'immutable-id',
        externalIdType: 'guid',
        link: 'https://example.com/article',
        title: 'Updated title',
        contentText: 'Updated text',
        status: 'read'
      }
    );
    const mutableValues = selectMutableArticleSourceValues(values);

    expect(mutableValues).toMatchObject({
      url: 'https://example.com/article',
      urlHash: hashValue('https://example.com/article'),
      normalizedUrlHash: hashValue('https://example.com/article'),
      title: 'Updated title',
      contentText: 'Updated text',
      contentTextHash: hashValue('Updated text')
    });
    expect(mutableValues).not.toHaveProperty('externalId');
    expect(mutableValues).not.toHaveProperty('externalIdType');
    expect(mutableValues).not.toHaveProperty('status');
    expect(mutableValues).not.toHaveProperty('userId');
    expect(mutableValues).not.toHaveProperty('feedId');
  });

  it('normalizes publication timestamps to whole-second database precision', () => {
    const values = buildArticlePersistenceValues(
      { id: 7, userId: 42 },
      {
        published: '2026-07-13T13:30:00.987Z',
        publishedSource: new Date('2026-07-13T13:30:00.654Z')
      }
    );

    expect(values.published).toEqual(new Date('2026-07-13T13:30:00.000Z'));
    expect(values.publishedSource).toEqual(new Date('2026-07-13T13:30:00.000Z'));
  });

  it.each([undefined, null, '', '   \n  '])(
    'does not create a visible-text hash for absent contentText value %s',
    contentText => {
      const values = buildArticlePersistenceValues(
        { id: 7, userId: 42 },
        {
          link: 'https://example.com/media-only',
          title: 'Media-only article',
          media: { type: 'video', url: 'https://cdn.example/video.mp4' },
          contentText
        }
      );

      expect(values.contentText).toBeNull();
      expect(values.contentTextHash).toBeNull();
    }
  );
});
