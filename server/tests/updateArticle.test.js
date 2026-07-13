import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocked = vi.hoisted(() => ({
  articleFindOne: vi.fn(),
  articleUpdate: vi.fn()
}));

vi.mock('../models/index.js', () => ({
  default: {
    Article: {
      findOne: mocked.articleFindOne
    }
  }
}));

describe('updateArticle', () => {
  beforeEach(() => {
    mocked.articleFindOne.mockReset();
    mocked.articleUpdate.mockReset();
  });

  it('updates only mutable feed content for a matching external identity', async () => {
    const article = {
      id: 123,
      update: mocked.articleUpdate
    };
    mocked.articleFindOne.mockResolvedValue(article);
    mocked.articleUpdate.mockResolvedValue(article);

    const { default: updateArticle } = await import('../services/crawl/updateArticle.js');
    const result = await updateArticle(
      { id: 7, userId: 42 },
      {
        externalId: 'article-6402680',
        externalIdType: 'guid',
        link: 'https://example.com/articles/6402680',
        normalizedUrl: 'https://example.com/articles/6402680',
        media: { type: 'video', url: 'https://video.example/watch/1' },
        leadImage: 'https://example.com/image.jpg',
        title: 'Updated title',
        author: 'Updated author',
        description: 'Updated description',
        contentOriginal: '<p>Updated body</p>',
        contentStripped: '<p>Updated body</p>',
        contentText: 'Updated body',
        published: new Date('2026-07-13T13:30:00Z'),
        publishedSource: new Date('2026-07-13T13:30:00Z'),
        publishInferred: false,
        contentStrippedHash: null,
        contentHash: 'content-hash',
        status: 'read',
        qualityScore: 100,
        eventId: 99
      }
    );

    expect(mocked.articleFindOne).toHaveBeenCalledWith({
      where: {
        userId: 42,
        feedId: 7,
        externalId: 'article-6402680',
        externalIdType: 'guid'
      }
    });
    expect(mocked.articleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      media: { type: 'video', url: 'https://video.example/watch/1' },
      url: 'https://example.com/articles/6402680',
      imageUrl: 'https://example.com/image.jpg',
      title: 'Updated title',
      contentHash: 'content-hash',
      contentStrippedHash: createHash('sha256')
        .update('Updated body')
        .digest('hex')
    }));
    expect(Object.keys(mocked.articleUpdate.mock.calls[0][0]).sort()).toEqual([
      'author',
      'contentHash',
      'contentOriginal',
      'contentStripped',
      'contentStrippedHash',
      'contentText',
      'description',
      'imageUrl',
      'media',
      'normalizedUrl',
      'normalizedUrlHash',
      'publishInferred',
      'published',
      'publishedSource',
      'title',
      'url',
      'urlHash'
    ]);
    expect(result).toEqual({ article, matched: true, changed: true });
  });

  it('skips lookup when the external identity is incomplete', async () => {
    const { default: updateArticle } = await import('../services/crawl/updateArticle.js');

    await expect(updateArticle({ id: 7, userId: 42 }, {
      externalId: null,
      externalIdType: null
    })).resolves.toEqual({ article: null, matched: false, changed: false });
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
  });

  it('preserves stored content and metadata when an update is sparse', async () => {
    const originalPublished = new Date('2026-07-12T10:00:00Z');
    const originalPublishedSource = new Date('2026-07-12T09:00:00Z');
    const article = {
      imageUrl: 'https://example.com/original.jpg',
      media: { type: 'audio', url: 'https://cdn.example/audio.mp3' },
      title: 'Original title',
      author: 'Original author',
      description: 'Original description',
      contentOriginal: '<p>Original body</p>',
      contentStripped: '<p>Original body</p>',
      contentText: 'Original body',
      contentStrippedHash: 'original-stripped-hash',
      contentHash: 'original-content-hash',
      published: originalPublished,
      publishedSource: originalPublishedSource,
      publishInferred: true,
      update: mocked.articleUpdate
    };
    mocked.articleFindOne.mockResolvedValue(article);
    mocked.articleUpdate.mockResolvedValue(article);

    const { default: updateArticle } = await import('../services/crawl/updateArticle.js');
    await updateArticle(
      { id: 7, userId: 42 },
      {
        externalId: 'article-6402680',
        externalIdType: 'guid',
        link: 'https://example.com/articles/6402680',
        normalizedUrl: 'https://example.com/articles/6402680',
        media: null,
        leadImage: null,
        title: 'Updated title',
        author: '',
        description: null,
        contentOriginal: null,
        contentStripped: '   ',
        contentText: undefined,
        published: null,
        publishedSource: null,
        publishInferred: false,
        contentStrippedHash: null,
        contentHash: null
      }
    );

    expect(mocked.articleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://example.com/original.jpg',
      media: { type: 'audio', url: 'https://cdn.example/audio.mp3' },
      title: 'Updated title',
      author: 'Original author',
      description: 'Original description',
      contentOriginal: '<p>Original body</p>',
      contentStripped: '<p>Original body</p>',
      contentText: 'Original body',
      contentStrippedHash: 'original-stripped-hash',
      contentHash: 'original-content-hash',
      published: originalPublished,
      publishedSource: originalPublishedSource,
      publishInferred: true
    }));
  });

  it('does not write an unchanged matching article', async () => {
    const published = new Date('2026-07-13T13:30:00Z');
    const article = {
      url: 'https://example.com/articles/6402680?utm_source=feed',
      normalizedUrl: 'https://example.com/articles/6402680',
      imageUrl: 'https://example.com/image.jpg',
      title: 'Article title',
      author: 'Article author',
      description: 'Article description',
      contentText: 'Article body',
      published,
      update: mocked.articleUpdate
    };
    mocked.articleFindOne.mockResolvedValue(article);

    const { default: updateArticle } = await import('../services/crawl/updateArticle.js');
    const result = await updateArticle(
      { id: 7, userId: 42 },
      {
        externalId: 'article-6402680',
        externalIdType: 'guid',
        link: 'https://example.com/articles/6402680?utm_source=newsletter',
        normalizedUrl: 'https://example.com/articles/6402680',
        leadImage: 'https://example.com/image.jpg',
        title: ' Article title ',
        author: 'Article author',
        description: 'Article description',
        contentText: 'Article body',
        published: '2026-07-13T13:30:00.000Z'
      }
    );

    expect(mocked.articleUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ article, matched: true, changed: false });
  });
});
