import { describe, expect, it, vi } from 'vitest';

import processDescriptionContent from '../../services/crawl/content/processDescriptionContent.js';

describe('processDescriptionContent', () => {
  it('sanitizes active markup while preserving useful formatting and absolute links', () => {
    const result = processDescriptionContent(
      '<p onclick="alert(1)">Read <strong>this</strong> ' +
      '<a href="/story" onmouseover="alert(2)">story</a>.</p>' +
      '<a href="javascript:alert(3)">bad</a><script>alert(4)</script>' +
      '<svg onload="alert(5)"><text>payload</text></svg>',
      'html',
      'https://example.com/feed/article'
    );

    expect(result.html).toContain('<p>Read <strong>this</strong>');
    expect(result.html).toContain('href="https://example.com/story"');
    expect(result.html).not.toMatch(/onclick|onmouseover|javascript:|<script|<svg/i);
    expect(result.text).toBe('Read this story.\n\nbad');
  });

  it('escapes explicitly plain descriptions without interpreting markup or entities', () => {
    const source = '2 < 3 & 4 > 1.\n\nLiteral <b>tag</b> &amp; entity.';
    const result = processDescriptionContent(source, 'text', 'https://example.com/article');

    expect(result.text).toBe(source);
    expect(result.html).toBe(
      '<p>2 &lt; 3 &amp; 4 &gt; 1.</p>\n' +
      '<p>Literal &lt;b&gt;tag&lt;/b&gt; &amp;amp; entity.</p>'
    );
  });

  it('recovers malformed HTML and decodes visible entities once', () => {
    const result = processDescriptionContent(
      '<p>First &amp; second<p><strong>Malformed ending',
      'html',
      'https://example.com/article'
    );

    expect(result.html).toContain('First &amp; second');
    expect(result.html).toContain('<strong>Malformed ending</strong>');
    expect(result.text).toBe('First & second\n\nMalformed ending');
  });

  it('removes explicitly hidden description content before sanitization', () => {
    const result = processDescriptionContent(
      '<p>Visible summary.</p><div style="display:none">SEO text</div>' +
      '<p aria-hidden="true">Inaccessible text</p>',
      'html',
      'https://example.com/article'
    );

    expect(result.html).toBe('<p>Visible summary.</p>');
    expect(result.text).toBe('Visible summary.');
  });

  it('falls back to escaped visible text when sanitization fails', async () => {
    vi.resetModules();
    vi.doMock('../../services/crawl/content/sanitizeHtmlContent.js', () => ({
      default: () => { throw new Error('sanitizer unavailable'); }
    }));
    const { default: processWithFailure } = await import(
      '../../services/crawl/content/processDescriptionContent.js'
    );

    const result = processWithFailure(
      '<p>Visible</p><script>alert(1)</script><p>Fallback</p>',
      'html',
      'https://example.com/article'
    );

    expect(result).toEqual({
      html: '<p>Visible</p>\n<p>Fallback</p>',
      text: 'Visible\n\nFallback'
    });
    vi.doUnmock('../../services/crawl/content/sanitizeHtmlContent.js');
  });
});
