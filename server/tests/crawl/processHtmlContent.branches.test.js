import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  detectLanguage: vi.fn(),
  sanitizeHtml: vi.fn(),
  transformDocument: vi.fn(),
  transformSource: vi.fn()
}));

vi.mock('../../utils/language.js', () => ({
  default: { get: mocks.detectLanguage }
}));

vi.mock('../../services/crawl/content/sanitizeHtmlContent.js', () => ({
  default: mocks.sanitizeHtml
}));

vi.mock('../../services/crawl/content/compatibility/transformWordPressContent.js', () => ({
  transformWordPressContent: mocks.transformDocument,
  transformWordPressSourceContent: mocks.transformSource
}));

const { default: processHtmlContent } = await import(
  '../../services/crawl/content/processHtmlContent.js'
);

const feed = { feedName: 'Branch feed' };

describe('processHtmlContent fallback behavior', () => {
  beforeEach(() => {
    mocks.detectLanguage.mockReset().mockReturnValue('eng');
    mocks.sanitizeHtml.mockReset().mockImplementation(value => value);
    mocks.transformDocument.mockReset();
    mocks.transformSource.mockReset().mockImplementation(value => value);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns no result when a source compatibility transform removes all content', () => {
    mocks.transformSource.mockReturnValue('');

    expect(processHtmlContent('source', null, null, feed, 'Title')).toBeNull();
  });

  it('uses an unknown language when detection fails', () => {
    mocks.detectLanguage.mockImplementation(() => {
      throw new Error('language unavailable');
    });

    const result = processHtmlContent(
      'This sufficiently long article text triggers automatic language detection.',
      null,
      null,
      feed,
      'Language failure'
    );

    expect(result.language).toBe('unknown');
    expect(console.error).toHaveBeenCalledWith(
      '[Branch feed] Error detecting language for article "Language failure":',
      'language unavailable'
    );
  });

  it('falls back to safe plain text when HTML sanitization throws', () => {
    mocks.sanitizeHtml.mockImplementation(() => {
      throw new Error('sanitizer unavailable');
    });

    const result = processHtmlContent(
      '<article><p>Fallback body</p></article>',
      null,
      'https://example.com/article',
      feed,
      'Fallback title'
    );

    expect(result).toMatchObject({
      html: '<p>Fallback body</p>',
      text: 'Fallback body',
      language: 'unknown',
      title: 'Fallback title'
    });
    expect(result.contentSourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.contentTextHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
