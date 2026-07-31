import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import {
  eventSummaryLine,
  logEventProcessingSummary,
  summarizeActiveEvents
} from '../../services/events/eventPipelineDebug.js';

describe('eventPipelineDebug', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats summary lines and aggregates active event sizes', async () => {
    vi.spyOn(db.Event, 'findAll').mockResolvedValue([
      { articleCount: 1 },
      { articleCount: 2 },
      { articleCount: 5 },
      { articleCount: null }
    ]);

    expect(eventSummaryLine('A label longer than the configured summary width', 2))
      .toContain('. 2');
    await expect(summarizeActiveEvents(4)).resolves.toEqual({
      activeEventCount: 4,
      averageArticlesPerEvent: '2.0',
      largestEventSize: 5,
      singleArticleEvents: 1,
      twoArticleEvents: 1,
      fivePlusArticleEvents: 1
    });
  });

  it('logs skipped vectors and assignments to events created in the run', async () => {
    vi.spyOn(db.Event, 'findAll')
      .mockResolvedValueOnce([{ articleCount: 3 }])
      .mockResolvedValueOnce([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await logEventProcessingSummary(4, [{ id: 1 }, { id: 2 }, { id: 3 }], {
      newEventIds: new Set([10, 'invalid']),
      stats: {
        linkedToExistingEventCount: 1,
        newEventsCreatedCount: 1,
        topicOnlyNoVectorCount: 1,
        eventVectorSkippedCount: 1
      }
    });

    expect(log.mock.calls.flat().join('\n')).toContain('Articles skipped event-vector');
    expect(log.mock.calls.flat().join('\n')).toContain('3');
  });

  it('uses zero ratios when processing an empty run without new events', async () => {
    vi.spyOn(db.Event, 'findAll').mockResolvedValue([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await logEventProcessingSummary(4, [], {
      newEventIds: new Set(),
      stats: {}
    });

    expect(log.mock.calls.flat().join('\n')).toContain('0.0%');
  });
});
