import { describe, expect, it } from 'vitest';
import {
  OPML_IMPORT_MAX_BYTES,
  OpmlImportError,
  importOpmlSubscriptions
} from '../../services/feeds/opmlImport.js';

describe('importOpmlSubscriptions', () => {
  // This operation verifies parameter tampering cannot substitute text or arrays for upload bytes.
  it.each([
    ['string', '<opml><body /></opml>'],
    ['array', ['<opml>', '<body />', '</opml>']]
  ])('rejects %s content before OPML processing', async (_type, content) => {
    await expect(importOpmlSubscriptions({
      userId: 1,
      content
    })).rejects.toEqual(
      new OpmlImportError('Invalid OPML content')
    );
  });

  it('rejects empty and oversized OPML uploads', async () => {
    await expect(importOpmlSubscriptions({
      userId: 1,
      content: Buffer.alloc(0)
    })).rejects.toEqual(
      new OpmlImportError('No OPML file provided')
    );
    await expect(importOpmlSubscriptions({
      userId: 1,
      content: Buffer.alloc(OPML_IMPORT_MAX_BYTES + 1)
    })).rejects.toEqual(
      new OpmlImportError('OPML file is too large')
    );
  });

  it('rejects malformed OPML and documents without feed outlines', async () => {
    await expect(importOpmlSubscriptions({
      userId: 1,
      content: Buffer.from('<opml><body>')
    })).rejects.toEqual(
      new OpmlImportError('Invalid OPML format')
    );
    await expect(importOpmlSubscriptions({
      userId: 1,
      content: Buffer.from(
        '<opml><body><outline text="Empty category" /></body></opml>'
      )
    })).rejects.toEqual(
      new OpmlImportError('Invalid OPML format')
    );
  });
});
