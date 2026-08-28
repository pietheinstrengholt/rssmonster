import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({ enqueueProcessingJob: vi.fn() }));

vi.mock('../../services/jobs/processingJobQueue.js', () => ({
  enqueueProcessingJob: mocked.enqueueProcessingJob
}));

import {
  enqueueGeneratedSemanticLabelJobsForUser,
  enqueueSemanticLabelJob,
  reconcileSemanticLabelJobsForUser,
  SEMANTIC_LABEL_CONTRACT_VERSION,
  semanticLabelDedupeKey,
  tryEnqueueGeneratedSemanticLabelJobsForUser,
  tryReconcileSemanticLabelJobsForUser
} from '../../services/semanticLabels/semanticLabelJobs.js';

const enabledEnvironment = { INFERENCE_AI_ENABLED: 'true' };
const row = id => ({ id });
const createModels = ({ events = [], topics = [], islands = [] } = {}) => ({
  event: {
    findAll: vi.fn(({ limit } = {}) => Promise.resolve(limit ? events.slice(0, limit) : events)),
    findOne: vi.fn().mockResolvedValue(events[0] || null)
  },
  topic: {
    findAll: vi.fn(({ limit } = {}) => Promise.resolve(limit ? topics.slice(0, limit) : topics)),
    findOne: vi.fn().mockResolvedValue(topics[0] || null)
  },
  island: {
    findAll: vi.fn(({ limit } = {}) => Promise.resolve(limit ? islands.slice(0, limit) : islands)),
    findOne: vi.fn().mockResolvedValue(islands[0] || null)
  }
});

describe('semantic label job producer', () => {
  beforeEach(() => {
    mocked.enqueueProcessingJob.mockReset().mockResolvedValue({ created: true });
  });

  it('enqueues only after owned targets exist, with identifier-only versioned payloads', async () => {
    const models = createModels({ events: [row(10)], topics: [row(20)], islands: [row(30)] });

    await enqueueGeneratedSemanticLabelJobsForUser(7, {
      eventIds: [10],
      topicIds: [20],
      islandIds: [30]
    }, { models, environment: enabledEnvironment });

    expect(models.event.findAll.mock.invocationCallOrder[0])
      .toBeLessThan(mocked.enqueueProcessingJob.mock.invocationCallOrder[0]);
    expect(mocked.enqueueProcessingJob.mock.calls.map(([job]) => job)).toEqual([
      expect.objectContaining({ type: 'semantic_label', userId: 7, articleId: null }),
      expect.objectContaining({ type: 'semantic_label', userId: 7, articleId: null }),
      expect.objectContaining({ type: 'semantic_label', userId: 7, articleId: null })
    ]);
    expect(mocked.enqueueProcessingJob.mock.calls.map(([job]) => job.payload)).toEqual([
      { userId: 7, targetType: 'event', targetId: 10, labelContractVersion: SEMANTIC_LABEL_CONTRACT_VERSION },
      { userId: 7, targetType: 'topic', targetId: 20, labelContractVersion: SEMANTIC_LABEL_CONTRACT_VERSION },
      { userId: 7, targetType: 'island', targetId: 30, labelContractVersion: SEMANTIC_LABEL_CONTRACT_VERSION }
    ]);
    expect(JSON.stringify(mocked.enqueueProcessingJob.mock.calls)).not.toContain('title');
  });

  it('uses one stable ownership- and contract-scoped dedupe key', async () => {
    const models = createModels({ events: [row(10)] });
    mocked.enqueueProcessingJob
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false });

    await enqueueSemanticLabelJob({ userId: 7, targetType: 'event', targetId: 10 }, {
      models,
      environment: enabledEnvironment
    });
    await enqueueSemanticLabelJob({ userId: 7, targetType: 'event', targetId: 10 }, {
      models,
      environment: enabledEnvironment
    });

    const keys = mocked.enqueueProcessingJob.mock.calls.map(([job]) => job.dedupeKey);
    expect(keys).toEqual([keys[0], keys[0]]);
    expect(keys[0]).toBe(semanticLabelDedupeKey({ userId: 7, targetType: 'event', targetId: 10 }));
  });

  it('does not enqueue missing, foreign, already-labelled, or archived targets', async () => {
    const models = createModels();

    await expect(enqueueSemanticLabelJob({
      userId: 7,
      targetType: 'island',
      targetId: 30
    }, { models, environment: enabledEnvironment })).resolves.toEqual({
      created: false,
      skipped: 'ineligible'
    });

    expect(models.island.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 7,
        generatedLabel: null,
        archivedInd: false,
        id: { [Op.in]: [30] }
      })
    }));
    expect(mocked.enqueueProcessingJob).not.toHaveBeenCalled();
  });

  it('reconciles a bounded total of eligible null-label rows and excludes archived islands', async () => {
    const models = createModels({
      events: [row(1), row(2)],
      topics: [row(3), row(4)],
      islands: [row(5)]
    });

    const result = await reconcileSemanticLabelJobsForUser(7, {
      limit: 3,
      models,
      environment: enabledEnvironment
    });

    expect(result).toEqual({
      eventCount: 2,
      topicCount: 1,
      islandCount: 0,
      scannedCount: 3
    });
    expect(models.event.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    expect(models.topic.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
    expect(models.island.findAll).not.toHaveBeenCalled();

    models.event.findAll.mockResolvedValue([]);
    models.topic.findAll.mockResolvedValue([]);
    await reconcileSemanticLabelJobsForUser(7, {
      limit: 3,
      models,
      environment: enabledEnvironment
    });
    expect(models.island.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 7, generatedLabel: null, archivedInd: false })
    }));
  });

  it('isolates enqueue failures from the deterministic semantic pipeline', async () => {
    const models = createModels({ events: [row(10)] });
    const logger = { warn: vi.fn() };
    mocked.enqueueProcessingJob.mockRejectedValue(new Error('queue unavailable'));

    await expect(tryEnqueueGeneratedSemanticLabelJobsForUser(7, {
      eventIds: [10]
    }, { models, environment: enabledEnvironment, logger })).resolves.toMatchObject({
      enqueueFailed: true
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[SEMANTIC LABEL JOB] user=7 enqueue skipped',
      { code: 'SEMANTIC_LABEL_ENQUEUE_FAILED' }
    );
  });

  it('isolates reconciliation failures from the deterministic semantic pipeline', async () => {
    const models = createModels({ events: [row(10)] });
    const logger = { warn: vi.fn() };
    mocked.enqueueProcessingJob.mockRejectedValue(new Error('queue unavailable'));

    await expect(tryReconcileSemanticLabelJobsForUser(7, {
      models,
      environment: enabledEnvironment,
      logger
    })).resolves.toMatchObject({ reconciliationFailed: true });
    expect(logger.warn).toHaveBeenCalledWith(
      '[SEMANTIC LABEL JOB] user=7 reconciliation skipped',
      { code: 'SEMANTIC_LABEL_RECONCILIATION_FAILED' }
    );
  });
});
