import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleSemanticLabelJob,
  SemanticLabelJobError
} from '../../services/jobs/handlers/semanticLabelJobHandler.js';
import {
  executeClaimedProcessingJob,
  getProcessingJobHandler,
  processingJobHandlerRegistry
} from '../../services/jobs/processingJobHandlers.js';
import { MAX_SEMANTIC_LABEL_ARTICLE_TITLES } from '../../services/semanticLabels/semanticLabeling.js';
import db from '../../models/index.js';

const { ProcessingJob, User } = db;

const enabledEnvironment = { INFERENCE_AI_ENABLED: 'true' };
const job = (targetType, targetId, userId = 7) => ({
  id: `semantic-label-${targetType}-${targetId}`,
  type: 'semantic_label',
  userId,
  payload: {
    userId,
    targetType,
    targetId,
    labelContractVersion: 1
  }
});

const targetRow = values => ({
  generatedName: null,
  generatedLabel: null,
  archivedInd: false,
  populationAudit: [],
  update: vi.fn().mockResolvedValue(undefined),
  ...values
});

const createDependencies = ({ event, topic, island, eventTitles = [], topicTitles = [] } = {}) => {
  const models = {
    Article: { findAll: vi.fn().mockResolvedValue(eventTitles.map(title => ({ title }))) },
    ArticleTopic: {
      findAll: vi.fn().mockResolvedValue(topicTitles.map(title => ({ Article: { title } })))
    },
    event: { findOne: vi.fn().mockResolvedValue(event || null) },
    topic: { findOne: vi.fn().mockResolvedValue(topic || null) },
    island: { findOne: vi.fn().mockResolvedValue(island || null) }
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const sequelize = {
    transaction: vi.fn(callback => callback(transaction))
  };
  return { models, sequelize, transaction };
};

describe('semantic_label processing-job handler', () => {
  let requestLabels;

  beforeEach(() => {
    requestLabels = vi.fn().mockResolvedValue({ event: 'Generated Event' });
  });

  it('is registered and stores only the event presentation field from current bounded context', async () => {
    expect(getProcessingJobHandler('semantic_label')).toBe(handleSemanticLabelJob);
    const event = targetRow({ id: 10, userId: 7, name: 'Deterministic Event' });
    const titles = Array.from({ length: 15 }, (_, index) => `Current title ${index + 1}`);
    const dependencies = createDependencies({ event, eventTitles: titles });

    await expect(handleSemanticLabelJob(job('event', 10), {
      ...dependencies,
      environment: enabledEnvironment,
      requestLabels
    })).resolves.toEqual({ status: 'labelled', targetType: 'event', targetId: 10 });

    expect(dependencies.models.Article.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 7, eventId: 10 }),
      attributes: ['title'],
      order: [['publishedAt', 'DESC'], ['id', 'DESC']],
      limit: MAX_SEMANTIC_LABEL_ARTICLE_TITLES
    }));
    expect(requestLabels).toHaveBeenCalledWith({
      context: titles.slice(0, MAX_SEMANTIC_LABEL_ARTICLE_TITLES),
      event: true
    }, { signal: undefined });
    expect(event.update).toHaveBeenCalledWith(
      { generatedName: 'Generated Event' },
      { transaction: dependencies.transaction }
    );
    expect(event.update.mock.calls[0][0]).not.toHaveProperty('name');
  });

  it('updates the appropriate topic and island generated presentation fields', async () => {
    const topic = targetRow({ id: 20, userId: 7, name: 'Deterministic Topic' });
    const topicDependencies = createDependencies({ topic, topicTitles: ['Newest topic title'] });
    await handleSemanticLabelJob(job('topic', 20), {
      ...topicDependencies,
      environment: enabledEnvironment,
      requestLabels: vi.fn().mockResolvedValue({ topic: 'Generated Topic' })
    });
    expect(topic.update).toHaveBeenCalledWith(
      { generatedName: 'Generated Topic' },
      { transaction: topicDependencies.transaction }
    );

    const island = targetRow({
      id: 30,
      userId: 7,
      label: 'Deterministic Island',
      populationAudit: [{
        sourceArticles: { articles: [{ title: 'Current island title' }] }
      }]
    });
    const islandDependencies = createDependencies({ island });
    await handleSemanticLabelJob(job('island', 30), {
      ...islandDependencies,
      environment: enabledEnvironment,
      requestLabels: vi.fn().mockResolvedValue({ island: 'Generated Island' })
    });
    expect(island.update).toHaveBeenCalledWith(
      { generatedLabel: 'Generated Island' },
      { transaction: islandDependencies.transaction }
    );
  });

  it('safely succeeds for deleted or foreign targets without loading context', async () => {
    const dependencies = createDependencies();

    await expect(handleSemanticLabelJob(job('event', 99), {
      ...dependencies,
      environment: enabledEnvironment,
      requestLabels
    })).resolves.toEqual({ status: 'obsolete', reason: 'target_missing_or_foreign' });
    expect(dependencies.models.Article.findAll).not.toHaveBeenCalled();
    expect(requestLabels).not.toHaveBeenCalled();
  });

  it('safely succeeds when the target is already labelled or an island is archived', async () => {
    const labelledEvent = targetRow({ id: 10, userId: 7, generatedName: 'Existing Label' });
    const labelledDependencies = createDependencies({ event: labelledEvent });
    await expect(handleSemanticLabelJob(job('event', 10), {
      ...labelledDependencies,
      environment: enabledEnvironment,
      requestLabels
    })).resolves.toEqual({ status: 'obsolete', reason: 'already_labelled' });

    const archivedIsland = targetRow({ id: 30, userId: 7, archivedInd: true });
    const archivedDependencies = createDependencies({ island: archivedIsland });
    await expect(handleSemanticLabelJob(job('island', 30), {
      ...archivedDependencies,
      environment: enabledEnvironment,
      requestLabels
    })).resolves.toEqual({ status: 'obsolete', reason: 'island_archived' });
    expect(requestLabels).not.toHaveBeenCalled();
  });

  it('rechecks idempotency under a lock before writing an inferred label', async () => {
    const initial = targetRow({ id: 10, userId: 7 });
    const completedByAnotherWorker = targetRow({
      id: 10,
      userId: 7,
      generatedName: 'Concurrent Label'
    });
    const dependencies = createDependencies({ event: initial, eventTitles: ['Current title'] });
    dependencies.models.event.findOne
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(completedByAnotherWorker);

    await expect(handleSemanticLabelJob(job('event', 10), {
      ...dependencies,
      environment: enabledEnvironment,
      requestLabels
    })).resolves.toEqual({ status: 'obsolete', reason: 'already_labelled' });
    expect(initial.update).not.toHaveBeenCalled();
    expect(completedByAnotherWorker.update).not.toHaveBeenCalled();
  });

  it('marks transient inference failures retryable without exposing title context', async () => {
    const event = targetRow({ id: 10, userId: 7 });
    const dependencies = createDependencies({ event, eventTitles: ['Private current title'] });
    requestLabels.mockRejectedValue(Object.assign(new Error('provider unavailable'), {
      code: 'INFERENCE_UNAVAILABLE',
      requestId: 'semantic-label-request'
    }));

    await expect(handleSemanticLabelJob(job('event', 10), {
      ...dependencies,
      environment: enabledEnvironment,
      requestLabels
    })).rejects.toMatchObject({
      constructor: SemanticLabelJobError,
      code: 'SEMANTIC_LABEL_INFERENCE_FAILED',
      message: 'Semantic label inference failed',
      retryable: true,
      requestId: 'semantic-label-request'
    });
    expect(event.update).not.toHaveBeenCalled();
  });

  it('requeues a claimed semantic-label job after a transient handler failure', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await User.create({
      username: `semantic-label-retry-${suffix}`,
      password: 'secret',
      feverCredentialHash: `semantic-label-retry-hash-${suffix}`,
      role: 'user'
    });
    const leaseOwner = 'semantic-label-retry-worker';
    const claimedJob = await ProcessingJob.create({
      type: 'semantic_label',
      userId: user.id,
      dedupeKey: `semantic-label-retry-${suffix}`,
      payload: { userId: user.id, targetType: 'event', targetId: 10, labelContractVersion: 1 },
      status: 'running',
      attempts: 1,
      maxAttempts: 3,
      availableAt: new Date(),
      leaseOwner,
      leaseUntil: new Date(Date.now() + 60_000)
    });
    const registeredHandler = getProcessingJobHandler('semantic_label');
    processingJobHandlerRegistry.set('semantic_label', vi.fn().mockRejectedValue(
      new SemanticLabelJobError(
        'SEMANTIC_LABEL_INFERENCE_FAILED',
        'Semantic label inference failed',
        { retryable: true }
      )
    ));

    try {
      await expect(executeClaimedProcessingJob(claimedJob, { leaseOwner })).resolves.toMatchObject({
        status: 'pending'
      });
      expect(await claimedJob.reload()).toMatchObject({
        status: 'pending',
        lastErrorCode: 'SEMANTIC_LABEL_INFERENCE_FAILED',
        lastErrorMessage: 'Semantic label inference failed',
        leaseOwner: null
      });
    } finally {
      processingJobHandlerRegistry.set('semantic_label', registeredHandler);
    }
  });
});
