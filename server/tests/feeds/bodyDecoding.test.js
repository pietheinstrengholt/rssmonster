import { describe, expect, it } from 'vitest';
import { decodeResponseBytes } from '../../services/feeds/http/bodyDecoding.js';
import { parseFeedSource } from '../../services/feeds/parser.js';

// Encodes one string as UTF-16BE for byte-order coverage.
const encodeUtf16Be = value => {
  const littleEndian = Buffer.from(value, 'utf16le');
  const bigEndian = Buffer.alloc(littleEndian.length);
  for (let index = 0; index < littleEndian.length; index += 2) {
    bigEndian[index] = littleEndian[index + 1];
    bigEndian[index + 1] = littleEndian[index];
  }
  return new Uint8Array(bigEndian);
};

// Builds a compact RSS body with an explicit encoding declaration.
const rss = (encoding, title) =>
  `<?xml version="1.0" encoding="${encoding}"?>` +
  `<rss version="2.0"><channel><title>${title}</title></channel></rss>`;

describe('feed response charset decoding', () => {
  it.each([
    ['without BOM', new TextEncoder().encode(rss('UTF-8', 'Café'))],
    ['with BOM', Uint8Array.from([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode(rss('UTF-8', 'Café'))
    ])]
  ])('decodes UTF-8 %s', (_label, bytes) => {
    const decoded = decodeResponseBytes(bytes, {});

    expect(decoded.text).toContain('<title>Café</title>');
    expect(decoded.charset).toBe('utf-8');
  });

  it('decodes UTF-16LE and UTF-16BE feeds with BOM precedence', () => {
    const littleBody = Buffer.from(rss('UTF-16', 'Little endian'), 'utf16le');
    const little = decodeResponseBytes(
      Uint8Array.from([0xff, 0xfe, ...littleBody]),
      { 'content-type': 'application/xml; charset=windows-1252' }
    );
    const bigBody = encodeUtf16Be(rss('UTF-16', 'Big endian'));
    const big = decodeResponseBytes(
      Uint8Array.from([0xfe, 0xff, ...bigBody]),
      {}
    );

    expect(parseFeedSource(little.text).title).toBe('Little endian');
    expect(parseFeedSource(big.text).title).toBe('Big endian');
    expect(little).toMatchObject({ charset: 'utf-16le', charsetSource: 'bom' });
    expect(big).toMatchObject({ charset: 'utf-16be', charsetSource: 'bom' });
  });

  it('infers UTF-16 byte order without a BOM', () => {
    const decoded = decodeResponseBytes(
      encodeUtf16Be(rss('UTF-16', 'Pattern detected')),
      {}
    );

    expect(decoded).toMatchObject({
      charset: 'utf-16be',
      charsetSource: 'xml'
    });
    expect(parseFeedSource(decoded.text).title).toBe('Pattern detected');
  });

  it('decodes ISO-8859-1 and Windows-1252 without replacement characters', () => {
    const isoSource = rss('ISO-8859-1', 'Café');
    const isoBytes = Uint8Array.from([...isoSource].map(char => char.codePointAt(0)));
    const windowsPrefix =
      '<?xml version="1.0" encoding="Windows-1252"?>' +
      '<rss version="2.0"><channel><title>Publisher ';
    const windowsBytes = Uint8Array.from([
      ...Buffer.from(windowsPrefix, 'ascii'),
      0x93,
      ...Buffer.from('News', 'ascii'),
      0x94,
      ...Buffer.from('</title></channel></rss>', 'ascii')
    ]);

    const iso = decodeResponseBytes(isoBytes, {});
    const windows = decodeResponseBytes(windowsBytes, {});

    expect(parseFeedSource(iso.text).title).toBe('Café');
    expect(parseFeedSource(windows.text).title).toBe('Publisher “News”');
    expect(iso.charset).toBe('iso-8859-1');
    expect(windows.charset).toBe('windows-1252');
  });

  it('uses a supported HTTP charset before a conflicting XML declaration', () => {
    const source = rss('ISO-8859-1', 'Price ');
    const prefix = source.replace('</title></channel></rss>', '');
    const bytes = Uint8Array.from([
      ...Buffer.from(prefix, 'ascii'),
      0x80,
      ...Buffer.from('</title></channel></rss>', 'ascii')
    ]);
    const decoded = decodeResponseBytes(bytes, {
      'content-type': 'application/rss+xml; charset=windows-1252'
    });

    expect(decoded).toMatchObject({
      charset: 'windows-1252',
      charsetSource: 'http'
    });
    expect(parseFeedSource(decoded.text).title).toBe('Price €');
  });

  it('does not treat an XML-looking HTML script string as an encoding declaration', () => {
    const html =
      '<html><body><script><?xml version="1.0" encoding="KOI8-R"?>' +
      '</script></body></html>';
    const decoded = decodeResponseBytes(new TextEncoder().encode(html), {});

    expect(decoded).toMatchObject({ charset: 'utf-8', charsetSource: 'default' });
    expect(decoded.text).toBe(html);
  });

  it.each([
    [
      new TextEncoder().encode(rss('KOI8-R', 'Unsupported')),
      {},
      'UNSUPPORTED_FEED_CHARSET'
    ],
    [Uint8Array.from([0xc3, 0x28]), {}, 'INVALID_FEED_ENCODING']
  ])('fails cleanly for unsupported or invalid input', (bytes, headers, code) => {
    expect(() => decodeResponseBytes(bytes, headers)).toThrow(
      expect.objectContaining({ code })
    );
  });
});
