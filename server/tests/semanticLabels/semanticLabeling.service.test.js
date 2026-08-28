import { describe, expect, it, vi } from 'vitest';
import {
  populateGeneratedSemanticLabelsForUser,
  tryPopulateGeneratedSemanticLabelsForUser
} from '../../services/semanticLabels/semanticLabeling.js';

const row = values => ({ ...values, update: vi.fn().mockResolvedValue(undefined) });

const createModels = ({ events = [], topics = [], islands = [], eventArticles = {}, topicArticles = {} } = {}) => ({
  Article: {
    findAll: vi.fn(({ where }) => Promise.resolve(eventArticles[where.eventId] || []))
  },
  ArticleTopic: {
    findAll: vi.fn(({ where }) => Promise.resolve(topicArticles[where.topicId] || []))
  },
  Event: { findAll: vi.fn().mockResolvedValue(events) },
  Topic: { findAll: vi.fn().mockResolvedValue(topics) },
  Island: { findAll: vi.fn().mockResolvedValue(islands) }
});

describe('populateGeneratedSemanticLabelsForUser', () => {
  it('populates generated fields from bounded article-title context only', async () => {
    const event = row({ id: 10 });
    const topic = row({ id: 20 });
    const island = row({
      id: 30,
      populationAudit: [{
        sourceArticles: {
          articles: [{ title: 'Local Qwen models' }, { title: 'Private AI infrastructure' }]
        }
      }]
    });
    const models = createModels({
      events: [event],
      topics: [topic],
      islands: [island],
      eventArticles: {
        10: [{ title: 'Qwen model released' }, { title: 'Qwen model released' }]
      },
      topicArticles: {
        20: [{ Article: { title: 'Qwen model released' } }, { Article: { title: 'Qwen benchmarks' } }]
      }
    });
    const requestLabels = vi.fn(input => Promise.resolve({
      event: input.event ? 'Qwen Releases New Model' : undefined,
      topic: input.topic ? 'Qwen Models' : undefined,
      island: input.island ? 'Local AI' : undefined
    }));

    const result = await populateGeneratedSemanticLabelsForUser(7, {
      eventIds: [10, 10],
      topicIds: [20],
      islandIds: [30]
    }, {
      environment: { INFERENCE_AI_ENABLED: 'true' },
      models,
      requestLabels
    });

    expect(requestLabels.mock.calls.map(([input]) => input)).toEqual([
      { context: ['Qwen model released'], event: true },
      { context: ['Qwen model released', 'Qwen benchmarks'], topic: true },
      { context: ['Local Qwen models', 'Private AI infrastructure'], island: true }
    ]);
    expect(event.update).toHaveBeenCalledWith({ generatedName: 'Qwen Releases New Model' });
    expect(topic.update).toHaveBeenCalledWith({ generatedName: 'Qwen Models' });
    expect(island.update).toHaveBeenCalledWith({ generatedLabel: 'Local AI' });
    expect(result).toEqual({
      eventCount: 1,
      topicCount: 1,
      islandCount: 1,
      skippedNoContextCount: 0,
      inferenceUnavailable: false
    });
  });

  it('does no database or inference work when inference is disabled', async () => {
    const models = createModels();
    const requestLabels = vi.fn();

    await expect(populateGeneratedSemanticLabelsForUser(7, {
      eventIds: [10],
      islandIds: [30]
    }, {
      environment: { INFERENCE_AI_ENABLED: 'false' },
      models,
      requestLabels
    })).resolves.toMatchObject({ inferenceUnavailable: false });

    expect(models.Event.findAll).not.toHaveBeenCalled();
    expect(models.Island.findAll).not.toHaveBeenCalled();
    expect(requestLabels).not.toHaveBeenCalled();
  });

  it('does no labeling work when semantic labeling is explicitly skipped', async () => {
    const models = createModels();
    const requestLabels = vi.fn();

    await populateGeneratedSemanticLabelsForUser(7, {
      eventIds: [10],
      topicIds: [20],
      islandIds: [30]
    }, {
      environment: {
        INFERENCE_AI_ENABLED: 'true',
        SKIP_SEMANTIC_LABELING: 'true'
      },
      models,
      requestLabels
    });

    expect(models.Event.findAll).not.toHaveBeenCalled();
    expect(models.Topic.findAll).not.toHaveBeenCalled();
    expect(models.Island.findAll).not.toHaveBeenCalled();
    expect(requestLabels).not.toHaveBeenCalled();
  });

  it('keeps deterministic fields untouched and stops after one inference failure', async () => {
    const event = row({ id: 10, name: 'Deterministic event' });
    const topic = row({ id: 20, name: 'Deterministic topic' });
    const models = createModels({
      events: [event],
      topics: [topic],
      eventArticles: { 10: [{ title: 'Event title' }] },
      topicArticles: { 20: [{ Article: { title: 'Topic title' } }] }
    });
    const requestLabels = vi.fn().mockRejectedValue(new Error('offline'));
    const logger = { warn: vi.fn() };

    const result = await populateGeneratedSemanticLabelsForUser(7, {
      eventIds: [10],
      topicIds: [20]
    }, {
      environment: { INFERENCE_AI_ENABLED: 'true' },
      models,
      requestLabels,
      logger
    });

    expect(requestLabels).toHaveBeenCalledOnce();
    expect(models.Topic.findAll).not.toHaveBeenCalled();
    expect(event.update).not.toHaveBeenCalled();
    expect(topic.update).not.toHaveBeenCalled();
    expect(event.name).toBe('Deterministic event');
    expect(topic.name).toBe('Deterministic topic');
    expect(result.inferenceUnavailable).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      '[SEMANTIC LABEL] user=7 type=event inference unavailable',
      expect.objectContaining({ message: 'Inference semantic labeling request failed' })
    );
  });

  it('skips records without article-title context and leaves generated fields null', async () => {
    const event = row({ id: 10 });
    const models = createModels({ events: [event], eventArticles: { 10: [] } });
    const requestLabels = vi.fn();

    const result = await populateGeneratedSemanticLabelsForUser(7, {
      eventIds: [10]
    }, {
      environment: { INFERENCE_AI_ENABLED: 'true' },
      models,
      requestLabels
    });

    expect(requestLabels).not.toHaveBeenCalled();
    expect(event.update).not.toHaveBeenCalled();
    expect(result.skippedNoContextCount).toBe(1);
  });

  it('does not expose unexpected enrichment failures to the deterministic pipeline', async () => {
    const models = createModels();
    models.Event.findAll.mockRejectedValue(new Error('database unavailable'));
    const logger = { warn: vi.fn() };

    const result = await tryPopulateGeneratedSemanticLabelsForUser(7, {
      eventIds: [10]
    }, {
      environment: { INFERENCE_AI_ENABLED: 'true' },
      models,
      logger
    });

    expect(result.inferenceUnavailable).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      '[SEMANTIC LABEL] user=7 enrichment skipped',
      expect.objectContaining({ message: 'Inference semantic labeling request failed' })
    );
  });
});
