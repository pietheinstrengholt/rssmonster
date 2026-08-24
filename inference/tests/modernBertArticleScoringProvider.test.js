import { describe, expect, it, vi } from 'vitest';
import {
  createModernBertArticleScoringProvider
} from '../src/classifications/providers/modernBertArticleScoringProvider.js';

const { pipelineMock } = vi.hoisted(() => ({ pipelineMock: vi.fn() }));

vi.mock('@huggingface/transformers', () => ({ env: {}, pipeline: pipelineMock }));

const createDependencies = () => {
  const classifier = vi.fn()
    .mockResolvedValueOnce({
      labels: ['purely editorial', 'partly promotional', 'strongly promotional'],
      scores: [0.8, 0.15, 0.05]
    })
    .mockResolvedValueOnce({
      labels: ['neutral and calm', 'mildly opinionated', 'strongly emotionally charged'],
      scores: [0.1, 0.2, 0.7]
    })
    .mockResolvedValueOnce({
      labels: ['high-quality informative writing', 'average-quality writing', 'poor-quality writing'],
      scores: [0.3, 0.6, 0.1]
    });
  return {
    classifier,
    dependencies: {
      configureCache: vi.fn().mockResolvedValue('/cache/models'),
      loadClassifier: vi.fn().mockResolvedValue(classifier),
      logger: { log: vi.fn() }
    }
  };
};

describe('ModernBERT article scoring provider', () => {
  it('loads one cached classifier for concurrent initialization', async () => {
    const { dependencies } = createDependencies();
    const provider = createModernBertArticleScoringProvider({ dependencies });

    await Promise.all([provider.initialize(), provider.initialize(), provider.initialize()]);

    expect(dependencies.configureCache).toHaveBeenCalledOnce();
    expect(dependencies.loadClassifier).toHaveBeenCalledOnce();
    expect(dependencies.loadClassifier).toHaveBeenCalledWith(
      'onnx-community/ModernBERT-base-nli-ONNX',
      'q8'
    );
    expect(provider.isLoaded()).toBe(true);
    await provider.initialize();
    expect(dependencies.loadClassifier).toHaveBeenCalledOnce();
  });

  it('treats absent label scores as zero and recovers its scoring queue after failure', async () => {
    const classifier = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue({ labels: [], scores: [] });
    const dependencies = {
      configureCache: vi.fn(),
      loadClassifier: vi.fn().mockResolvedValue(classifier),
      logger: { log: vi.fn() }
    };
    const provider = createModernBertArticleScoringProvider({ dependencies });
    const input = { text: 'Text' };

    await expect(provider.score(input)).rejects.toThrow('temporary failure');
    await expect(provider.score(input)).resolves.toEqual({
      advertisementScore: 0,
      sentimentScore: 0,
      qualityScore: 0
    });
  });

  it('maps NLI label probabilities to the existing score buckets', async () => {
    const { classifier, dependencies } = createDependencies();
    const provider = createModernBertArticleScoringProvider({ dependencies });

    await expect(provider.score({
      text: 'Article content',
      title: 'Article title',
      feedName: 'Feed name'
    })).resolves.toEqual({
      advertisementScore: 90,
      sentimentScore: 40,
      qualityScore: 70
    });

    expect(classifier).toHaveBeenCalledTimes(3);
    expect(classifier.mock.calls[0][0]).toContain('Title: Article title');
    expect(classifier.mock.calls[0][2]).toEqual({
      hypothesis_template: 'This article is {}.',
      multi_label: false
    });
  });

  it('reports safe model metadata without loading the model', () => {
    const { dependencies } = createDependencies();
    const provider = createModernBertArticleScoringProvider({ dependencies });

    expect(provider.getMetadata()).toEqual({
      provider: 'modernbert',
      modelId: 'onnx-community/ModernBERT-base-nli-ONNX',
      dtype: 'q8',
      device: 'cpu',
      task: 'zero-shot-classification'
    });
    expect(provider.isLoaded()).toBe(false);
    expect(dependencies.loadClassifier).not.toHaveBeenCalled();
  });

  it('loads the default zero-shot classification pipeline', async () => {
    pipelineMock.mockResolvedValue(vi.fn());
    const provider = createModernBertArticleScoringProvider({ environment: {} });

    await provider.initialize();

    expect(pipelineMock).toHaveBeenCalledWith(
      'zero-shot-classification',
      'onnx-community/ModernBERT-base-nli-ONNX',
      { dtype: 'q8', device: 'cpu' }
    );
  });
});
