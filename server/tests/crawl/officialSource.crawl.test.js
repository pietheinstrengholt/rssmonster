import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  officialSourceFindAll: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    OfficialSource: {
      findAll: mocked.officialSourceFindAll
    }
  }
}));

describe('official source crawl detection', () => {
  beforeEach(() => {
    mocked.officialSourceFindAll.mockReset();
  });

  it('matches root domains and subdomains without matching lookalike suffixes', async () => {
    const {
      doesHostnameMatchSourceDomain
    } = await import('../../services/crawl/enrichment/officialSource.js');

    expect(doesHostnameMatchSourceDomain('https://www.nintendo.com/us/news/', 'nintendo.com')).toBe(true);
    expect(doesHostnameMatchSourceDomain('news.nintendo.com', 'nintendo.com')).toBe(true);
    expect(doesHostnameMatchSourceDomain('notnintendo.com', 'nintendo.com')).toBe(false);
  });

  it('resolves the matching organization from enabled official source rows', async () => {
    mocked.officialSourceFindAll.mockResolvedValue([
      { entity: 'Nintendo', domain: 'nintendo.com' },
      { entity: 'Sony', domain: 'sony.com' }
    ]);

    const {
      resolveOfficialSourceForArticle
    } = await import('../../services/crawl/enrichment/officialSource.js');

    await expect(
      resolveOfficialSourceForArticle(42, 'https://www.nintendo.com/us/news/')
    ).resolves.toEqual({
      isOfficialSource: true,
      officialOrganization: 'Nintendo'
    });

    expect(mocked.officialSourceFindAll).toHaveBeenCalledWith({
      attributes: ['entity', 'domain'],
      where: {
        userId: 42,
        enabled: true
      },
      raw: true
    });
  });

  it('normalizes wildcards and malformed values and returns empty metadata for misses', async () => {
    mocked.officialSourceFindAll.mockResolvedValue([
      { entity: 'Specific', domain: 'news.example.com' },
      { entity: 'Example', domain: '*.example.com' }
    ]);
    const {
      createEmptyOfficialSource,
      doesHostnameMatchSourceDomain,
      normalizeSourceHostname,
      resolveOfficialSourceForArticle
    } = await import('../../services/crawl/enrichment/officialSource.js');

    expect(createEmptyOfficialSource()).toEqual({
      isOfficialSource: false,
      officialOrganization: null
    });
    expect(normalizeSourceHostname('  *.WWW.Example.com/path  ')).toBe('example.com');
    expect(normalizeSourceHostname('https://[invalid/path')).toBe('https');
    expect(normalizeSourceHostname('')).toBeNull();
    expect(doesHostnameMatchSourceDomain('', 'example.com')).toBe(false);
    await expect(resolveOfficialSourceForArticle(null, null)).resolves.toEqual(createEmptyOfficialSource());
    await expect(resolveOfficialSourceForArticle(42, 'https://missing.test/story')).resolves.toEqual(createEmptyOfficialSource());
    await expect(resolveOfficialSourceForArticle(42, 'https://news.example.com/story')).resolves.toEqual({
      isOfficialSource: true,
      officialOrganization: 'Specific'
    });
  });
});
