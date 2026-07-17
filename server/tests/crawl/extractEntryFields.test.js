import { describe, expect, it } from 'vitest';
import normalizeEntry, {
  resolveEntryModifiedDate,
  resolveEntryPublishedDate,
  resolveFeedPublishedDate,
  resolveUrlPublishedDate
} from '../../services/feeds/feedsmith/normalizeEntry.js';

describe('extract entry fields', () => {
  it('resolves entry publishedAt dates from expanded FeedSmith candidates', () => {
    expect(resolveEntryPublishedDate({
      dcterms: {
        created: new Date('2026-07-02T10:00:00Z')
      }
    })).toBe('2026-07-02T10:00:00.000Z');

    expect(resolveEntryPublishedDate({
      date_modified: '2026-07-03T11:30:00Z'
    })).toBe('2026-07-03T11:30:00.000Z');

    expect(resolveEntryPublishedDate({
      atom: {
        published: '2026-07-04T12:45:00Z'
      }
    })).toBe('2026-07-04T12:45:00.000Z');
  });

  it('resolves modification metadata independently from publication metadata', () => {
    expect(resolveEntryPublishedDate({
      updated: '2026-07-04T12:45:00.987Z'
    })).toBeNull();

    expect(resolveEntryModifiedDate({
      updated: '2026-07-04T12:45:00.987Z'
    })).toBe('2026-07-04T12:45:00.987Z');

    expect(resolveEntryModifiedDate({
      atom: { updated: '2026-07-05T13:15:00Z' }
    })).toBe('2026-07-05T13:15:00.000Z');

    expect(resolveEntryModifiedDate({
      dcterms: { modified: '2026-07-06T14:30:00Z' }
    })).toBe('2026-07-06T14:30:00.000Z');
  });

  it('uses candidate priority and skips invalid dates', () => {
    expect(resolveEntryPublishedDate({
      date_published: 'not-a-date',
      pubDate: '2026-07-01T09:00:00Z',
      dcterms: {
        created: '2026-07-02T09:00:00Z'
      }
    })).toBe('2026-07-01T09:00:00.000Z');
  });

  it('uses the resolver when extracting entry fields', () => {
    const fields = normalizeEntry({
      title: 'Article',
      link: 'https://example.com/article',
      dcterms: {
        modified: '2026-07-05T13:15:00Z'
      }
    });

    expect(fields.publishedAt).toBe('2026-07-05T13:15:00.000Z');
  });

  it('prefers an alternate article link over other links and entry.link', () => {
    const fields = normalizeEntry({
      title: 'Article',
      link: 'https://example.com/rss-fallback',
      links: [
        { rel: 'self', href: 'https://example.com/feed-entry' },
        { rel: 'alternate', href: 'https://example.com/canonical-article' }
      ]
    });

    expect(fields.url).toBe('https://example.com/canonical-article');
  });

  it('maps feed summary or description to description without inventing a fallback', () => {
    expect(normalizeEntry({
      title: 'Article',
      link: 'https://example.com/article',
      description: '<p>Feed description</p>',
      summary: '<p>Feed summary</p>'
    }).description).toBe('<p>Feed description</p>');

    expect(normalizeEntry({
      title: 'Article',
      link: 'https://example.com/article',
      description: '',
      summary: '<p>Feed summary</p>'
    }).description).toBe('<p>Feed summary</p>');

    expect(normalizeEntry({
      title: 'Article',
      link: 'https://example.com/article',
      description: ''
    }).description).toBeNull();
  });

  it('resolves feed-level publishedAt fallback dates', () => {
    expect(resolveFeedPublishedDate({
      atom: {
        updated: '2026-07-06T14:00:00Z'
      }
    })).toBe('2026-07-06T14:00:00.000Z');

    expect(resolveFeedPublishedDate({
      date_modified: '2026-07-07T15:30:00Z'
    })).toBe('2026-07-07T15:30:00.000Z');
  });

  it('resolves publishedAt fallback dates from common URL patterns', () => {
    expect(resolveUrlPublishedDate('https://example.com/2026/07/08/article-title')).toBe('2026-07-08T00:00:00.000Z');
    expect(resolveUrlPublishedDate('https://example.com/news/2026-07-08/article-title')).toBe('2026-07-08T00:00:00.000Z');
  });

  it('ignores invalid URL date patterns', () => {
    expect(resolveUrlPublishedDate('https://example.com/2026/13/08/article-title')).toBeNull();
    expect(resolveUrlPublishedDate('https://example.com/2026/02/31/article-title')).toBeNull();
    expect(resolveUrlPublishedDate('https://example.com/article-2026-07-08-title')).toBeNull();
  });
});
