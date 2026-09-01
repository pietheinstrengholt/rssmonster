import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOpmlPreviewJobs,
  getOpmlPreviewJob,
  startOpmlPreviewJob
} from '../../services/feeds/opmlPreviewJobs.js';
import { OPML_PREVIEW_TIMEOUT_MS } from '../../services/feeds/opmlImport.js';

afterEach(() => {
  clearOpmlPreviewJobs();
});

describe('OPML preview jobs', () => {
  it('tracks connection progress and exposes the completed preview to its owner', async () => {
    const subscriptions = [{
      inputUrl: 'https://example.test/first',
      alreadySubscribed: false,
      duplicateInFile: false
    }, {
      inputUrl: 'https://example.test/existing',
      alreadySubscribed: true,
      duplicateInFile: false
    }, {
      inputUrl: 'https://example.test/duplicate',
      alreadySubscribed: false,
      duplicateInFile: true
    }];
    const prepare = vi.fn().mockResolvedValue({
      subscriptions,
      existingCategoryNames: ['Existing']
    });
    const markConnections = vi.fn().mockImplementation(async (_input, options) => {
      options.onProgress();
      return subscriptions.map(subscription => ({
        ...subscription,
        connectionStatus: subscription.alreadySubscribed || subscription.duplicateInFile
          ? 'not_checked'
          : 'available'
      }));
    });
    const preview = { subscriptionCount: 3, categories: [], subscriptions };
    const buildPreview = vi.fn().mockReturnValue(preview);

    const started = await startOpmlPreviewJob({
      userId: 42,
      content: Buffer.from('<opml />')
    }, {
      idFactory: () => 'preview-job',
      clock: () => 1000,
      prepare,
      markConnections,
      buildPreview
    });

    expect(started).toEqual({
      previewId: 'preview-job',
      status: 'running',
      checkedFeeds: 0,
      totalFeeds: 1
    });
    expect(getOpmlPreviewJob({ previewId: 'preview-job', userId: 7 })).toBeNull();

    await vi.waitFor(() => {
      expect(getOpmlPreviewJob({
        previewId: 'preview-job',
        userId: 42
      })).toEqual({
        previewId: 'preview-job',
        status: 'completed',
        checkedFeeds: 1,
        totalFeeds: 1,
        preview
      });
    });
    expect(markConnections).toHaveBeenCalledWith({
      userId: 42,
      subscriptions,
      deadlineAt: 1000 + OPML_PREVIEW_TIMEOUT_MS
    }, expect.objectContaining({
      clock: expect.any(Function),
      onProgress: expect.any(Function)
    }));
    expect(buildPreview).toHaveBeenCalledWith({
      subscriptions: expect.any(Array),
      existingCategoryNames: ['Existing']
    });
  });

  it('retains a safe terminal error when asynchronous validation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await startOpmlPreviewJob({
      userId: 42,
      content: Buffer.from('<opml />')
    }, {
      idFactory: () => 'failed-job',
      prepare: vi.fn().mockResolvedValue({
        subscriptions: [{
          inputUrl: 'https://example.test/feed',
          alreadySubscribed: false,
          duplicateInFile: false
        }],
        existingCategoryNames: []
      }),
      markConnections: vi.fn().mockRejectedValue(new Error('private details'))
    });

    await vi.waitFor(() => {
      expect(getOpmlPreviewJob({
        previewId: 'failed-job',
        userId: 42
      })).toEqual({
        previewId: 'failed-job',
        status: 'failed',
        checkedFeeds: 0,
        totalFeeds: 1,
        error: 'OPML preview validation failed'
      });
    });
  });
});
