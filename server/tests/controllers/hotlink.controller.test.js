import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({
  bulkCreate: vi.fn(),
  destroy: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Hotlink: {
      bulkCreate: mocked.bulkCreate,
      destroy: mocked.destroy
    },
    sequelize: {
      transaction: mocked.transaction
    }
  }
}));

const { replaceMany, setMany } = await import('../../controllers/hotlink.js');

describe('hotlink controller', () => {
  beforeEach(() => {
    mocked.bulkCreate.mockReset().mockResolvedValue(undefined);
    mocked.destroy.mockReset().mockResolvedValue(undefined);
    mocked.transaction.mockReset().mockImplementation(callback =>
      callback('transaction')
    );
  });

  it('atomically replaces one source article hotlink set', async () => {
    await setMany(
      ['https://example.com/one', 'https://example.com/one'],
      10,
      20,
      30
    );

    expect(mocked.destroy).toHaveBeenCalledWith({
      where: {
        userId: 20,
        feedId: 10,
        sourceArticleId: {
          [Op.in]: [30]
        }
      },
      transaction: 'transaction'
    });
    expect(mocked.bulkCreate).toHaveBeenCalledWith([
      {
        url: 'https://example.com/one',
        feedId: 10,
        userId: 20,
        sourceArticleId: 30
      }
    ], {
      transaction: 'transaction'
    });
  });

  it('removes stale observations when a revision has no hotlinks', async () => {
    await setMany([], 10, 20, 30);

    expect(mocked.destroy).toHaveBeenCalledTimes(1);
    expect(mocked.bulkCreate).not.toHaveBeenCalled();
  });

  it('replaces multiple article observations in one transaction', async () => {
    await replaceMany([
      {
        sourceArticleId: 30,
        urls: ['https://example.com/one']
      },
      {
        sourceArticleId: 31,
        urls: ['https://example.com/two']
      }
    ], 10, 20);

    expect(mocked.transaction).toHaveBeenCalledTimes(1);
    expect(mocked.bulkCreate).toHaveBeenCalledWith([
      {
        url: 'https://example.com/one',
        feedId: 10,
        userId: 20,
        sourceArticleId: 30
      },
      {
        url: 'https://example.com/two',
        feedId: 10,
        userId: 20,
        sourceArticleId: 31
      }
    ], {
      transaction: 'transaction'
    });
  });
});
