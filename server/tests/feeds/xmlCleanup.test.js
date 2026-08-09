import { describe, expect, it } from 'vitest';
import { parseFeedSource } from '../../services/feeds/parser.js';
import {
  prepareFeedSource,
  removeDoctypeDeclarations,
  replaceHtmlNamedEntities
} from '../../services/feeds/feedsmith/xmlCleanup.js';

// Builds a minimal RSS document around one channel payload.
const rss = channel =>
  `<rss version="2.0"><channel>${channel}</channel></rss>`;

describe('conservative dirty XML cleanup', () => {
  it('removes warning text before plausible RSS and Atom roots', () => {
    expect(parseFeedSource(
      `PHP Warning: publisher notice<br />${rss('<title>Recovered RSS</title>')}`
    ).title).toBe('Recovered RSS');
    expect(parseFeedSource(
      `garbage before feed<feed xmlns="http://www.w3.org/2005/Atom">` +
      `<title>Recovered Atom</title></feed>`
    ).title).toBe('Recovered Atom');
  });

  it('removes illegal XML controls while preserving tabs and line breaks', () => {
    const parsed = parseFeedSource(rss(
      '<title>Control\u0000\u0001 title\tstill valid</title>'
    ));

    expect(parsed.title).toBe('Control title\tstill valid');
  });

  it('converts known HTML entities without changing XML predefined entities', () => {
    const prepared = replaceHtmlNamedEntities(
      rss('<title>Publisher&nbsp;News &amp; Notes</title>')
    );

    expect(prepared).toContain('Publisher&#160;News &amp; Notes');
    expect(parseFeedSource(prepared).title).toBe('Publisher News & Notes');
  });

  it('removes external and internal DOCTYPE declarations without expanding entities', () => {
    const external =
      '<!DOCTYPE rss SYSTEM "https://example.test/feed.dtd">' +
      rss('<title>Safe doctype</title>');
    const entity =
      '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      rss('<title>&xxe;</title>');

    expect(removeDoctypeDeclarations(external)).toBe(
      rss('<title>Safe doctype</title>')
    );
    expect(parseFeedSource(external).title).toBe('Safe doctype');
    expect(() => parseFeedSource(entity)).toThrow(
      expect.objectContaining({ code: 'UNSAFE_FEED_XML' })
    );
  });

  it('preserves CDATA byte-for-character content during entity cleanup', () => {
    const source = rss(
      '<title>CDATA feed</title><item><title>Story</title>' +
      '<guid>story-1</guid>' +
      '<description><![CDATA[<p>A&nbsp;B &copy; C</p>]]></description>' +
      '</item>'
    );
    const prepared = prepareFeedSource(source);

    expect(prepared).toContain(
      '<![CDATA[<p>A&nbsp;B &copy; C</p>]]>'
    );
    expect(parseFeedSource(source).entries[0].description).toBe(
      '<p>A&nbsp;B &copy; C</p>'
    );
  });

  it('does not repair structurally invalid XML or HTML into feeds', () => {
    expect(() => parseFeedSource(
      '<rss version="2.0"><channel><title>Broken</channel></rss>'
    )).toThrow();
    expect(() => parseFeedSource(
      '<html><body><script>const sample = "<rss>fake</rss>";</script></body></html>'
    )).toThrow();
  });

  it('leaves JSON Feed strings containing XML-looking text and entities unchanged', () => {
    const source = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'JSON <rss> &nbsp;',
      items: [{
        id: 'json-1',
        content_text: 'Literal <![CDATA[&copy;]]> and <feed> text'
      }]
    });

    expect(prepareFeedSource(source)).toBe(source);
    const parsed = parseFeedSource(source);
    expect(parsed.title).toBe('JSON <rss> &nbsp;');
    expect(parsed.entries[0].content).toBe(
      'Literal <![CDATA[&copy;]]> and <feed> text'
    );
  });
});
