import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  destroy: vi.fn(),
  findAll: vi.fn(),
  getEmbeddingInfo: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    IslandTaxonomy: {
      count: mocks.count,
      create: mocks.create,
      destroy: mocks.destroy,
      findAll: mocks.findAll
    },
    Sequelize: { Op: { in: Symbol('in') } },
    sequelize: {
      authenticate: mocks.authenticate,
      transaction: mocks.transaction
    }
  }
}));

vi.mock('../../services/embeddings/embeddingService.js', () => ({
  embedTexts: vi.fn(),
  getEmbeddingInfo: mocks.getEmbeddingInfo
}));

describe('taxonomy vector command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue(undefined);
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue(undefined);
    mocks.destroy.mockResolvedValue(3);
    mocks.findAll.mockResolvedValue([]);
    mocks.getEmbeddingInfo.mockResolvedValue({ model: 'test-embedding-model' });
    mocks.transaction.mockImplementation(callback => callback({ id: 'transaction' }));
  });

  it('clears all taxonomy rows before synchronizing a forced rebuild', async () => {
    const { generateIslandTaxonomyVectors } =
      await import('../../scripts/generateIslandTaxonomyVectors.js');

    const result = await generateIslandTaxonomyVectors({ force: true });

    expect(mocks.destroy).toHaveBeenCalledWith({
      where: {},
      transaction: { id: 'transaction' }
    });
    expect(mocks.destroy.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(result.force).toBe(true);
  });

  it('preserves existing taxonomy rows during an incremental rebuild', async () => {
    const { generateIslandTaxonomyVectors } =
      await import('../../scripts/generateIslandTaxonomyVectors.js');

    await generateIslandTaxonomyVectors();

    const clearedWholeTable = mocks.destroy.mock.calls.some(
      ([options]) => Object.keys(options.where).length === 0
    );
    expect(clearedWholeTable).toBe(false);
  });
});
