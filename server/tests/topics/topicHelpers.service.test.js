import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  eventFindAll: vi.fn(),
  eventFindByPk: vi.fn(),
  averageVector: vi.fn(),
  blendVector: vi.fn(),
  cosineSimilarity: vi.fn(),
  canonicalArticleWhere: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: { findAll: mocks.articleFindAll },
    Event: { findAll: mocks.eventFindAll, findByPk: mocks.eventFindByPk },
    Sequelize: { Op: { ne: Symbol('ne') } }
  }
}));

vi.mock('../../services/vectors/index.js', () => ({
  averageVector: mocks.averageVector,
  blendVector: mocks.blendVector,
  cosineSimilarity: mocks.cosineSimilarity
}));

vi.mock('../../services/duplicates/articleDuplicates.js', () => ({
  canonicalArticleWhere: mocks.canonicalArticleWhere
}));

// Loads topic helpers after applying environment-controlled module constants.
async function loadHelpers(environment = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(environment)) {
    vi.stubEnv(name, value);
  }
  return import('../../services/topics/shared/topicHelpers.js');
}

describe('topic helper persistence and runtime switches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventFindAll.mockResolvedValue([]);
    mocks.eventFindByPk.mockResolvedValue(null);
    mocks.articleFindAll.mockResolvedValue([]);
    mocks.canonicalArticleWhere.mockReturnValue({ duplicateOfArticleId: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('emits debug messages with and without payloads when topic debugging is enabled', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { debugTopicGate } = await loadHelpers({ TOPIC_DEBUG: 'true' });

    debugTopicGate('plain');
    debugTopicGate('details', { eventId: 2 });

    expect(log).toHaveBeenNthCalledWith(1, '[TOPIC DEBUG] plain');
    expect(log).toHaveBeenNthCalledWith(2, '[TOPIC DEBUG] details', { eventId: 2 });
  });

  it('delegates vector blending with default and explicit alpha values', async () => {
    const {
      blendTopicVector,
      blendTopicVectorWithAlpha
    } = await loadHelpers({ TOPIC_VECTOR_ALPHA: '0.2' });
    mocks.blendVector.mockReturnValue([0.8, 0.2]);

    expect(blendTopicVector([1, 0], [0, 1])).toEqual([0.8, 0.2]);
    expect(blendTopicVectorWithAlpha([1, 0], [0, 1], 0.4)).toEqual([0.8, 0.2]);
    expect(mocks.blendVector).toHaveBeenNthCalledWith(1, [1, 0], [0, 1], 0.2);
    expect(mocks.blendVector).toHaveBeenNthCalledWith(2, [1, 0], [0, 1], 0.4);
  });

  it('generates deterministic keys only for array vectors', async () => {
    const { generateTopicKey } = await loadHelpers();

    expect(generateTopicKey(null)).toBeNull();
    expect(generateTopicKey([0.1234567, -0.5])).toMatch(/^[a-f0-9]{40}$/);
    expect(generateTopicKey([0.1234567, -0.5])).toBe(generateTopicKey([0.1234567, -0.5]));
  });

  it('loads and prepends the current event when it is absent from scored candidates', async () => {
    const currentEvent = { id: 9, eventVector: [1, 0] };
    mocks.eventFindAll.mockResolvedValue([
      { id: 1, eventVector: [1, 0] },
      { id: 2, eventVector: [0, 1] }
    ]);
    mocks.eventFindByPk.mockResolvedValue(currentEvent);
    mocks.cosineSimilarity
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.95);
    const { collectTopicSeedEvents } = await loadHelpers();

    const result = await collectTopicSeedEvents(3, [1, 0], 9);

    expect(result).toEqual([
      { event: currentEvent, similarity: 0.95 },
      { event: expect.objectContaining({ id: 1 }), similarity: 0.7 }
    ]);
    expect(mocks.eventFindByPk).toHaveBeenCalledWith(9, expect.objectContaining({ attributes: expect.any(Array) }));
  });

  it('does not prepend a current event without a usable vector', async () => {
    mocks.eventFindByPk.mockResolvedValue({ id: 9, eventVector: null });
    const { collectTopicSeedEvents } = await loadHelpers();

    await expect(collectTopicSeedEvents(3, [1, 0], 9)).resolves.toEqual([]);
  });

  it('loads canonical article titles and handles a missing event id', async () => {
    mocks.articleFindAll.mockResolvedValue([{ title: 'First' }, { title: '' }, { title: 'Second' }]);
    const { collectEventArticleTitles } = await loadHelpers();

    await expect(collectEventArticleTitles(3, null)).resolves.toEqual([]);
    await expect(collectEventArticleTitles(3, 8)).resolves.toEqual(['First', 'Second']);
    expect(mocks.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 3, eventId: 8, duplicateOfArticleId: null })
    }));
  });

  it('inserts and replaces topics in the in-memory cache', async () => {
    const { upsertTopicInCache } = await loadHelpers();
    const original = { id: 1, name: 'Original' };
    const replacement = { id: 1, name: 'Replacement' };
    const inserted = { id: 2, name: 'Inserted' };
    const cache = [original];

    upsertTopicInCache(null, inserted);
    upsertTopicInCache(cache, replacement);
    upsertTopicInCache(cache, inserted);

    expect(cache).toEqual([inserted, replacement]);
  });

  it('keeps debug and vector drift disabled by default', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { debugTopicGate, shouldDriftTopicVector } = await loadHelpers();

    debugTopicGate('hidden', { eventId: 2 });

    expect(log).not.toHaveBeenCalled();
    expect(shouldDriftTopicVector(0.8, 'incremental')).toBe(false);
  });

  it('enables drift only for finite incremental similarities within the cap', async () => {
    const { shouldDriftTopicVector } = await loadHelpers({
      TOPIC_VECTOR_DRIFT_ENABLED: 'true',
      TOPIC_VECTOR_DRIFT_MAX_SIMILARITY: '0.92'
    });

    expect(shouldDriftTopicVector(0.8, 'incremental')).toBe(true);
    expect(shouldDriftTopicVector(0.95, 'incremental')).toBe(false);
    expect(shouldDriftTopicVector(Number.NaN, 'incremental')).toBe(false);
    expect(shouldDriftTopicVector(0.8, 'recent-repair')).toBe(false);
  });
});
