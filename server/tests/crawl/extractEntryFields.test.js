import { describe, expect, it } from 'vitest';
import normalizeEntry, {
  resolveEntryModifiedDate,
  resolveEntryPublishedDate,
  resolveFeedPublishedDate,
  resolveUrlPublishedDate
} from '../../services/feeds/feedsmith/normalizeEntry.js';
import extractEntryFields from '../../services/crawl/extraction/extractEntryFields.js';

describe('extract entry fields', () => {
  // Maps every canonical publisher field without changing valid falsy values.
  it('maps a complete canonical entry into crawl source fields', () => {
    const publishedAt = new Date('2026-07-08T10:00:00Z');
    const modifiedAt = new Date('2026-07-08T11:00:00Z');

    expect(extractEntryFields({
      title: 'Canonical title',
      url: 'https://example.com/article',
      description: '',
      content: '<p>Body</p>',
      author: 'Alice',
      categories: ['News'],
      publishedAt,
      modifiedAt
    })).toEqual({
      title: 'Canonical title',
      link: 'https://example.com/article',
      description: '',
      content: '<p>Body</p>',
      author: 'Alice',
      categories: ['News'],
      publishedAt,
      modifiedAt
    });
  });

  // Supplies stable defaults when an entry or its optional fields are unavailable.
  it.each([undefined, null, {}, {
    title: '',
    url: '',
    categories: 'News'
  }])('defaults missing canonical fields for %#', entry => {
    expect(extractEntryFields(entry)).toEqual({
      title: 'Untitled',
      link: null,
      description: null,
      content: null,
      author: null,
      categories: [],
      publishedAt: null,
      modifiedAt: null
    });
  });

  it('resolves entry publishedAt dates from expanded FeedSmith candidates', () => {
    expect(resolveEntryPublishedDate({
      dcterms: {
        created: new Date('2026-07-02T10:00:00Z')
      }
    })).toBe('2026-07-02T10:00:00.000Z');

    expect(resolveEntryPublishedDate({
      date_modified: '2026-07-03T11:30:00Z'
    })).toBeNull();

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

    expect(resolveEntryPublishedDate({
      dcterms: {
        dates: ['not-a-date', '2026-07-03T09:00:00Z']
      }
    }, 'rss')).toBe('2026-07-03T09:00:00.000Z');
  });

  it('uses the resolver when extracting entry fields', () => {
    const fields = normalizeEntry({
      title: 'Article',
      link: 'https://example.com/article',
      dcterms: {
        modified: '2026-07-05T13:15:00Z'
      }
    });

    expect(fields.publishedAt).toBeNull();
    expect(fields.modifiedAt).toBe('2026-07-05T13:15:00.000Z');
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

  it('covers format-specific date fallbacks and empty resolver inputs', () => {
    expect(resolveEntryPublishedDate(null)).toBeNull();
    expect(resolveEntryModifiedDate(null)).toBeNull();
    expect(resolveFeedPublishedDate(null)).toBeNull();
    expect(resolveUrlPublishedDate(null)).toBeNull();
    expect(resolveEntryPublishedDate({
      dc: { dates: ['invalid', '2026-08-01T10:00:00Z'] }
    }, 'atom')).toBe('2026-08-01T10:00:00.000Z');
    expect(resolveEntryPublishedDate({
      dcterms: { dates: ['2026-08-02T10:00:00Z'] }
    }, 'rdf')).toBe('2026-08-02T10:00:00.000Z');
    expect(resolveEntryModifiedDate({
      dcterms: { modified: '2026-08-03T10:00:00Z' }
    }, 'atom')).toBe('2026-08-03T10:00:00.000Z');
  });

  it('normalizes author and category object shapes', () => {
    const fields = normalizeEntry({
      title: 'Object metadata',
      link: 'https://example.com/object-metadata',
      author: { name: 'Object Author' },
      categories: [
        null,
        ' Direct ',
        { term: 'Term' },
        { $: { label: 'Label' } }
      ]
    });

    expect(fields.author).toBe('Object Author');
    expect(fields.categories).toEqual(['Direct', 'Term', 'Label']);
  });

  it('keeps malformed URL strings on the no-date path', () => {
    expect(resolveUrlPublishedDate('https://[invalid/2026/08/04/story')).toBe(
      '2026-08-04T00:00:00.000Z'
    );
  });
});
