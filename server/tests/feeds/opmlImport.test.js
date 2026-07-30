import { describe, expect, it } from 'vitest';
import {
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
});
