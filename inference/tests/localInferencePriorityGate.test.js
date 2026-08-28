import { describe, expect, it } from 'vitest';
import {
  LOCAL_INFERENCE_PRIORITIES,
  runLocalInference
} from '../src/queue/localInferencePriorityGate.js';

describe('local inference priority gate', () => {
  it('runs waiting embedding work before scoring and generation', async () => {
    const executionOrder = [];
    let releaseRunningGeneration;
    const runningGeneration = runLocalInference(() => new Promise(resolve => {
      releaseRunningGeneration = () => {
        executionOrder.push('running-generation');
        resolve();
      };
    }), {
      priority: LOCAL_INFERENCE_PRIORITIES.generation,
      operation: 'generation'
    });
    const generation = runLocalInference(async () => {
      executionOrder.push('waiting-generation');
    }, {
      priority: LOCAL_INFERENCE_PRIORITIES.generation,
      operation: 'generation'
    });
    const scoring = runLocalInference(async () => {
      executionOrder.push('scoring');
    }, {
      priority: LOCAL_INFERENCE_PRIORITIES.scoring,
      operation: 'article-scoring'
    });
    const firstEmbedding = runLocalInference(async () => {
      executionOrder.push('embedding-one');
    }, {
      priority: LOCAL_INFERENCE_PRIORITIES.embedding,
      operation: 'embeddings'
    });
    const secondEmbedding = runLocalInference(async () => {
      executionOrder.push('embedding-two');
    }, {
      priority: LOCAL_INFERENCE_PRIORITIES.embedding,
      operation: 'embeddings'
    });

    releaseRunningGeneration();
    await Promise.all([
      runningGeneration,
      generation,
      scoring,
      firstEmbedding,
      secondEmbedding
    ]);

    expect(executionOrder).toEqual([
      'running-generation',
      'embedding-one',
      'embedding-two',
      'scoring',
      'waiting-generation'
    ]);
  });
});
