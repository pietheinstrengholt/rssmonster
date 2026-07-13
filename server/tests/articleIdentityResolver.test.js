import { describe, expect, it } from 'vitest';
import articleIdentityResolver from '../services/crawl/articleIdentityResolver.js';

describe('article identity resolver', () => {
  it('resolves a FeedSmith RSS guid as the external identity', () => {
    expect(articleIdentityResolver({
      guid: {
        value: 'https://www.engadget.com/2210476/ev-worst-range-in-2026/',
        isPermaLink: true
      }
    })).toEqual({
      externalId: 'https://www.engadget.com/2210476/ev-worst-range-in-2026/',
      externalIdType: 'guid'
    });
  });

  it('accepts a plain string guid and trims surrounding whitespace', () => {
    expect(articleIdentityResolver({ guid: ' article-6402680 ' })).toEqual({
      externalId: 'article-6402680',
      externalIdType: 'guid'
    });
  });

  it('resolves an Atom entry id as the external identity', () => {
    expect(articleIdentityResolver({
      id: 'https://www.theverge.com/?p=963759'
    })).toEqual({
      externalId: 'https://www.theverge.com/?p=963759',
      externalIdType: 'atom-id'
    });
  });

  it('resolves namespaced Atom identity on an RSS item', () => {
    expect(articleIdentityResolver({
      atom: {
        id: 'tag:example.com,2026:963759'
      }
    })).toEqual({
      externalId: 'tag:example.com,2026:963759',
      externalIdType: 'atom-id'
    });
  });

  it('prefers an Atom id by default when both feed identities exist', () => {
    expect(articleIdentityResolver({
      guid: { value: 'rss-guid' },
      id: 'atom-id'
    })).toEqual({
      externalId: 'atom-id',
      externalIdType: 'atom-id'
    });
  });

  it('prefers the identity native to the parsed feed format', () => {
    const entry = {
      guid: { value: 'rss-guid' },
      id: 'atom-id'
    };

    expect(articleIdentityResolver(entry, 'rss')).toEqual({
      externalId: 'rss-guid',
      externalIdType: 'guid'
    });
    expect(articleIdentityResolver(entry, 'atom')).toEqual({
      externalId: 'atom-id',
      externalIdType: 'atom-id'
    });
  });

  it('falls back to the complete normalized RSS article URL', () => {
    expect(articleIdentityResolver({
      link: 'https://www.theverge.com/article-title?p=1234'
    })).toEqual({
      externalId: 'https://www.theverge.com/article-title?p=1234',
      externalIdType: 'normalized-url'
    });
  });

  it('falls back to the complete normalized Atom article URL', () => {
    expect(articleIdentityResolver({
      links: [{
        rel: 'alternate',
        href: 'https://example.com/news/6402716/article-title'
      }]
    })).toEqual({
      externalId: 'https://example.com/news/6402716/article-title',
      externalIdType: 'normalized-url'
    });
  });

  it('does not guess identities from numeric path segments', () => {
    expect(articleIdentityResolver({
      link: 'https://example.com/articles/1234/title'
    })).toEqual({
      externalId: 'https://example.com/articles/1234/title',
      externalIdType: 'normalized-url'
    });
  });

  it('prefers feed-provided identity over the URL fallback', () => {
    expect(articleIdentityResolver({
      id: 'atom-entry-id',
      link: 'https://example.com/6402716/article-title'
    })).toEqual({
      externalId: 'atom-entry-id',
      externalIdType: 'atom-id'
    });
  });

  it('uses the complete URL even when it contains dates or unrelated numbers', () => {
    expect(articleIdentityResolver({
      link: 'https://example.com/2026/07/13/article?limit=1234'
    })).toEqual({
      externalId: 'https://example.com/2026/07/13/article?limit=1234',
      externalIdType: 'normalized-url'
    });
  });

  it('removes tracking parameters from normalized URL identities', () => {
    expect(articleIdentityResolver({
      link: 'https://Example.com/article/?p=1234&utm_source=rss#comments'
    })).toEqual({
      externalId: 'https://example.com/article?p=1234',
      externalIdType: 'normalized-url'
    });
  });

  it('returns an empty identity when no usable external identity exists', () => {
    expect(articleIdentityResolver({})).toEqual({
      externalId: null,
      externalIdType: null
    });
    expect(articleIdentityResolver({ guid: { value: '   ' } })).toEqual({
      externalId: null,
      externalIdType: null
    });
  });
});
