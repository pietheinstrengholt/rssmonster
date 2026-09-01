import { describe, expect, it } from 'vitest';
import {
  OPML_IMPORT_MAX_BYTES,
  OPML_PREVIEW_JSON_MAX_BYTES,
  OPML_PREVIEW_TIMEOUT_MS,
  OpmlImportError,
  buildOpmlPreview,
  importOpmlPreview,
  importOpmlSubscriptions,
  markOpmlConnectionStatus,
  previewOpmlSubscriptions
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
    expect(OPML_PREVIEW_JSON_MAX_BYTES).toBe(OPML_IMPORT_MAX_BYTES * 8);
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

  it('returns an editable preview with category counts and original metadata', async () => {
    const content = Buffer.from(`<opml><body>
      <outline text="News">
        <outline text="First" description="Description" xmlUrl="https://example.test/first" />
        <outline title="Second" xmlUrl="https://example.test/second" />
      </outline>
      <outline text="Loose" xmlUrl="https://example.test/loose" />
    </body></opml>`);

    await expect(previewOpmlSubscriptions({ content })).resolves.toEqual({
      subscriptionCount: 3,
      categories: [{ name: 'News', subscriptionCount: 2 }],
      categoryOptions: [{
        name: 'News',
        alreadyExists: false,
        fromOpml: true
      }],
      subscriptions: [{
        inputUrl: 'https://example.test/first',
        title: 'First',
        description: 'Description',
        categoryName: 'News',
        alreadySubscribed: false,
        duplicateInFile: false,
        selectedForImport: true,
        connectionStatus: 'not_checked'
      }, {
        inputUrl: 'https://example.test/second',
        title: 'Second',
        description: undefined,
        categoryName: 'News',
        alreadySubscribed: false,
        duplicateInFile: false,
        selectedForImport: true,
        connectionStatus: 'not_checked'
      }, {
        inputUrl: 'https://example.test/loose',
        title: 'Loose',
        description: undefined,
        categoryName: undefined,
        alreadySubscribed: false,
        duplicateInFile: false,
        selectedForImport: true,
        connectionStatus: 'not_checked'
      }]
    });
  });

  it('marks later canonical URL occurrences as within-file duplicates', async () => {
    const content = Buffer.from(`<opml><body>
      <outline text="First" xmlUrl="https://EXAMPLE.test:443/feed#original" />
      <outline text="Repeated" xmlUrl="https://example.test/feed#repeated" />
      <outline text="Different" xmlUrl="https://example.test/other" />
    </body></opml>`);

    const preview = await previewOpmlSubscriptions({ content });

    expect(preview.subscriptions).toEqual([
      expect.objectContaining({ title: 'First', duplicateInFile: false }),
      expect.objectContaining({ title: 'Repeated', duplicateInFile: true }),
      expect.objectContaining({ title: 'Different', duplicateInFile: false })
    ]);
  });

  it('deduplicates backend and OPML category options while retaining their origin', () => {
    const result = buildOpmlPreview({
      subscriptions: [{ categoryName: 'News' }, { categoryName: 'news' }, {
        categoryName: 'News'
      }, { categoryName: 'Technology' }],
      existingCategoryNames: ['Archive', 'News']
    });

    expect(result.categories).toEqual([
      { name: 'News', subscriptionCount: 3 },
      { name: 'Technology', subscriptionCount: 1 }
    ]);
    expect(result.categoryOptions).toEqual([
      { name: 'Archive', alreadyExists: true, fromOpml: false },
      { name: 'News', alreadyExists: true, fromOpml: true },
      { name: 'Technology', alreadyExists: false, fromOpml: true }
    ]);
    expect(result.subscriptions.map(subscription => subscription.categoryName))
      .toEqual(['News', 'News', 'News', 'Technology']);
  });

  it('rejects malformed preview JSON before importing subscriptions', async () => {
    await expect(importOpmlPreview({
      userId: 1,
      preview: { subscriptions: [{ inputUrl: 42 }] }
    })).rejects.toEqual(new OpmlImportError('Invalid OPML preview'));
  });

  it('leaves feeds not checked once the overall preview deadline is reached', async () => {
    expect(OPML_PREVIEW_TIMEOUT_MS).toBe(285000);
    let now = 1000;
    const connectionTest = vi.fn().mockImplementation(async () => {
      now += OPML_PREVIEW_TIMEOUT_MS;
      return 'available';
    });
    const subscriptions = [
      'first',
      'second',
      'third'
    ].map(name => ({
      inputUrl: `https://example.test/${name}`,
      alreadySubscribed: false,
      duplicateInFile: false
    }));

    const result = await markOpmlConnectionStatus({
      userId: 1,
      subscriptions,
      deadlineAt: now + OPML_PREVIEW_TIMEOUT_MS
    }, {
      connectionTest,
      clock: () => now
    });

    expect(connectionTest).toHaveBeenCalledOnce();
    expect(result.map(subscription => subscription.connectionStatus)).toEqual([
      'available',
      'not_checked',
      'not_checked'
    ]);
  });
});
