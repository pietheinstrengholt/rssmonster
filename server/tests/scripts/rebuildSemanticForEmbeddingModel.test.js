import { describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';
import {
  parseSemanticModelRebuildArgs,
  rebuildSemanticForEmbeddingModel
} from '../../scripts/rebuildSemanticForEmbeddingModel.js';
import { buildEngagedVectorTargetWhere } from '../../scripts/backfillEngagedArticleVectors.js';

describe('semantic model rebuild script', () => {
  it('requires explicit confirmation outside dry-run mode', () => {
    expect(() => parseSemanticModelRebuildArgs(['node', 'script'])).toThrow(/--confirm/);
    expect(parseSemanticModelRebuildArgs(['node', 'script', '--dry-run'])).toMatchObject({
      dryRun: true,
      confirm: false
    });
    expect(parseSemanticModelRebuildArgs([
      'node',
      'script',
      '--confirm',
      '--userId=4',
      '--batchSize=25'
    ])).toMatchObject({
      confirm: true,
      userId: 4,
      batchSize: 25
    });
  });

  it('limits the model-switch vector scope to stars and clicks', () => {
    const where = buildEngagedVectorTargetWhere({ includeFeedbackSignals: false });

    expect(where.articleVector).toBeNull();
    expect(where[Op.or]).toHaveLength(2);
    expect(where[Op.or][0]).toEqual({ favoriteInd: 1 });
    expect(where[Op.or][1].clickedAmount[Op.gt]).toBe(0);
  });

  it('reports scope without invoking destructive or inference rebuild stages in dry-run mode', async () => {
    const destructive = vi.fn();
    const dependencies = {
      authenticate: vi.fn(),
      getEmbeddingInfo: vi.fn().mockResolvedValue({ model: 'model-a', dimensions: 1024 }),
      loadTargetUsers: vi.fn().mockResolvedValue([{ id: 1 }]),
      inspectScope: vi.fn().mockResolvedValue({
        articles: 12,
        vectors: 10,
        rebuildTargets: 3,
        events: 2,
        topics: 1,
        islands: 1,
        taxonomyVectors: 8
      }),
      resetUser: destructive,
      backfillVectors: destructive,
      regenerateTaxonomy: destructive,
      markDuplicates: destructive,
      rebuildEvents: destructive,
      rebuildEventTopics: destructive,
      rebuildBehavioralTopics: destructive,
      rebuildIslands: destructive,
      logger: { log: vi.fn() }
    };

    const result = await rebuildSemanticForEmbeddingModel({ dryRun: true }, dependencies);

    expect(result).toMatchObject({ dryRun: true, userCount: 1 });
    expect(destructive).not.toHaveBeenCalled();
  });

  it('runs the destructive stages in dependency order for every selected user', async () => {
    const calls = [];
    const duplicatePages = new Map();
    const dependencies = {
      authenticate: vi.fn(async () => calls.push('authenticate')),
      getEmbeddingInfo: vi.fn(async () => {
        calls.push('embedding-info');
        return { model: 'model-b', dimensions: 768 };
      }),
      loadTargetUsers: vi.fn(async () => [{ id: 1 }, { id: 2 }]),
      inspectScope: vi.fn(async () => ({
        articles: 4,
        vectors: 4,
        rebuildTargets: 2,
        events: 1,
        topics: 1,
        islands: 1,
        taxonomyVectors: 2
      })),
      resetUser: vi.fn(async userId => calls.push(`reset:${userId}`)),
      backfillVectors: vi.fn(async options => {
        calls.push('vectors');
        expect(options).toMatchObject({ batchSize: 20, includeFeedbackSignals: false });
        return { embeddedCount: 2 };
      }),
      regenerateTaxonomy: vi.fn(async options => {
        calls.push('taxonomy');
        expect(options).toEqual({ force: true });
        return { updated: 2 };
      }),
      markDuplicates: vi.fn(async userId => {
        const page = duplicatePages.get(userId) || 0;
        duplicatePages.set(userId, page + 1);
        calls.push(`duplicates:${userId}:${page}`);
        return page === 0
          ? { scannedCount: 1, duplicateCount: 0, lastArticleId: userId * 10 }
          : { scannedCount: 0, duplicateCount: 0, lastArticleId: null };
      }),
      rebuildEvents: vi.fn(async userId => {
        calls.push(`events:${userId}`);
        return { touchedEventIds: [userId * 100] };
      }),
      rebuildEventTopics: vi.fn(async userId => {
        calls.push(`event-topics:${userId}`);
        return { touchedTopicIds: [userId * 1000] };
      }),
      rebuildBehavioralTopics: vi.fn(async userId => {
        calls.push(`behavioral-topics:${userId}`);
        return { touchedTopicIds: [userId * 2000] };
      }),
      rebuildIslands: vi.fn(async (userId, options) => {
        calls.push(`islands:${userId}`);
        expect(options.touchedTopicIds).toEqual([userId * 1000, userId * 2000]);
        return { islandCount: 1 };
      }),
      logger: { log: vi.fn() }
    };

    const result = await rebuildSemanticForEmbeddingModel({
      batchSize: 20,
      confirm: true
    }, dependencies);

    expect(result).toMatchObject({ dryRun: false, userCount: 2 });
    expect(calls).toEqual([
      'authenticate',
      'embedding-info',
      'reset:1',
      'reset:2',
      'vectors',
      'taxonomy',
      'duplicates:1:0',
      'duplicates:1:1',
      'events:1',
      'event-topics:1',
      'behavioral-topics:1',
      'islands:1',
      'duplicates:2:0',
      'duplicates:2:1',
      'events:2',
      'event-topics:2',
      'behavioral-topics:2',
      'islands:2'
    ]);
  });
});
