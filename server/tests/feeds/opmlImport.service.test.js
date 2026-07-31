import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  addFeedSubscription: vi.fn(),
  countCategories: vi.fn(),
  isFeedManagementError: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Category: {
      count: mocked.countCategories
    }
  }
}));

vi.mock('../../services/feeds/feedManagement.js', () => ({
  addFeedSubscription: mocked.addFeedSubscription,
  isFeedManagementError: mocked.isFeedManagementError
}));

const { importOpmlSubscriptions } = await import(
  '../../services/feeds/opmlImport.js'
);

describe('OPML subscription processing', () => {
  beforeEach(() => {
    mocked.addFeedSubscription.mockReset();
    mocked.countCategories.mockReset();
    mocked.isFeedManagementError.mockReset();
  });

  it('preserves nested metadata and counts created, existing, and failed feeds', async () => {
    const expectedError = { expected: true };
    const unexpectedError = new Error('database unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocked.countCategories
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4);
    mocked.addFeedSubscription
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false })
      .mockRejectedValueOnce(expectedError)
      .mockRejectedValueOnce(unexpectedError);
    mocked.isFeedManagementError.mockImplementation(
      error => error === expectedError
    );
    const content = Buffer.from(`<?xml version="1.0"?>
      <opml version="2.0"><body>
        <outline text="Technology">
          <outline text="Created" description="Created description"
            xmlUrl="https://example.com/created.xml" />
          <outline title="Existing"
            xmlUrl="https://example.com/existing.xml" />
        </outline>
        <outline text="Expected failure"
          xmlUrl="https://example.com/expected.xml" />
        <outline xmlUrl="https://example.com/unexpected.xml" />
      </body></opml>`);

    await expect(importOpmlSubscriptions({
      userId: 42,
      content
    })).resolves.toEqual({
      categoriesCreated: 2,
      feedsCreated: 1,
      feedsExisting: 1,
      feedsFailed: 2
    });
    expect(mocked.addFeedSubscription).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 42,
        inputUrl: 'https://example.com/created.xml',
        title: 'Created',
        description: 'Created description',
        categoryName: 'Technology',
        useDefaultCategory: false,
        allowExisting: true
      })
    );
    expect(mocked.addFeedSubscription).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        inputUrl: 'https://example.com/unexpected.xml',
        title: undefined,
        categoryName: undefined,
        useDefaultCategory: true
      })
    );
    expect(consoleError).toHaveBeenCalledWith(
      'Error importing OPML subscription:',
      unexpectedError
    );
    consoleError.mockRestore();
  });
});
