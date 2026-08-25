import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  count: vi.fn(),
  destroy: vi.fn(),
  findAll: vi.fn(),
  findAndCountAll: vi.fn(),
  findOne: vi.fn()
}));

vi.mock('../../models/index.js', async () => {
  const { Sequelize } = await vi.importActual('sequelize');
  return {
    default: {
      ProcessingFailure: {
        count: mocked.count,
        destroy: mocked.destroy,
        findAll: mocked.findAll,
        findAndCountAll: mocked.findAndCountAll,
        findOne: mocked.findOne,
        getAttributes: vi.fn(() => ({
          failureType: { values: ['ERROR', 'TIMEOUT', 'RATE_LIMITED'] }
        }))
      },
      Sequelize
    }
  };
});

const controller = (await import('../../controllers/processingFailure.js')).default;

const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  query: {},
  params: {},
  ...overrides
});

const createResponse = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe('processing failure settings controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns user-owned fingerprint groups with representative failure details', async () => {
    mocked.findOne.mockResolvedValue({
      totalOccurrences: '4',
      fatalOccurrences: '1',
      timeoutOccurrences: '3',
      retryableOccurrences: '2'
    });
    mocked.count.mockResolvedValue(1);
    mocked.findAll
      .mockResolvedValueOnce([{ stage: 'feed_fetch' }, { stage: 'embedding' }])
      .mockResolvedValueOnce([{
        fingerprint: 'a'.repeat(64),
        occurrenceCount: '4',
        firstOccurredAt: new Date('2026-08-20T09:00:00.000Z'),
        lastOccurredAt: new Date('2026-08-24T09:00:00.000Z'),
        latestFailureId: '91'
      }])
      .mockResolvedValueOnce([{
        id: 91,
        stage: 'feed_fetch',
        failureType: 'TIMEOUT',
        severity: 'ERROR',
        code: 'ETIMEDOUT',
        errorName: 'TimeoutError',
        message: 'Feed request timed out'
      }]);
    const res = createResponse();

    await controller.getProcessingFailureGroups(createRequest({
      query: { days: '30', failureType: 'TIMEOUT', limit: '25', stage: 'feed_fetch' }
    }), res);

    expect(mocked.count.mock.calls[0][0].where).toMatchObject({
      userId: 42,
      stage: 'feed_fetch',
      failureType: 'TIMEOUT'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      summary: {
        totalOccurrences: 4,
        groupCount: 1,
        fatalOccurrences: 1,
        timeoutOccurrences: 3,
        retryableOccurrences: 2
      },
      availableStages: ['feed_fetch', 'embedding'],
      groups: [expect.objectContaining({
        fingerprint: 'a'.repeat(64),
        occurrenceCount: 4,
        latestFailureId: 91,
        failureType: 'TIMEOUT',
        message: 'Feed request timed out'
      })]
    }));
  });

  it('returns bounded occurrences only for the requested user and fingerprint', async () => {
    mocked.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [{ id: 91, message: 'Feed request timed out' }]
    });
    const fingerprint = 'b'.repeat(64);
    const res = createResponse();

    await controller.getProcessingFailureOccurrences(createRequest({
      params: { fingerprint },
      query: { days: '7', limit: '10', offset: '0' }
    }), res);

    expect(mocked.findAndCountAll.mock.calls[0][0]).toMatchObject({
      where: { userId: 42, fingerprint },
      limit: 10,
      offset: 0,
      raw: true
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      fingerprint,
      failures: [{ id: 91, message: 'Feed request timed out' }]
    }));
  });

  it('returns full diagnostics only when the failure belongs to the current user', async () => {
    mocked.findOne.mockResolvedValue({
      id: 91,
      message: 'Database write failed',
      stackTrace: 'Error: Database write failed',
      context: { operation: 'article_create' }
    });
    const res = createResponse();

    await controller.getProcessingFailureDetail(createRequest({
      params: { failureId: '91' }
    }), res);

    expect(mocked.findOne.mock.calls[0][0].where).toEqual({ id: '91', userId: 42 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      failure: expect.objectContaining({
        id: 91,
        stackTrace: 'Error: Database write failed',
        context: { operation: 'article_create' }
      })
    });
  });

  it.each([
    ['getProcessingFailureGroups', createRequest({ userData: {} })],
    ['getProcessingFailureOccurrences', createRequest({ userData: {}, params: { fingerprint: 'a'.repeat(64) } })],
    ['getProcessingFailureDetail', createRequest({ userData: {}, params: { failureId: '1' } })]
  ])('rejects missing ownership for %s', async (method, req) => {
    const res = createResponse();

    await controller[method](req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects invalid bounded filters and identifiers before querying', async () => {
    const invalidRange = createResponse();
    const invalidFingerprint = createResponse();
    const invalidId = createResponse();

    await controller.getProcessingFailureGroups(createRequest({ query: { days: '0' } }), invalidRange);
    await controller.getProcessingFailureOccurrences(createRequest({
      params: { fingerprint: 'not-a-fingerprint' }
    }), invalidFingerprint);
    await controller.getProcessingFailureDetail(createRequest({
      params: { failureId: '-1' }
    }), invalidId);

    expect(invalidRange.status).toHaveBeenCalledWith(400);
    expect(invalidFingerprint.status).toHaveBeenCalledWith(400);
    expect(invalidId.status).toHaveBeenCalledWith(400);
    expect(mocked.findAll).not.toHaveBeenCalled();
  });

  it('does not reveal a failure owned by another user', async () => {
    mocked.findOne.mockResolvedValue(null);
    const res = createResponse();

    await controller.getProcessingFailureDetail(createRequest({
      params: { failureId: '91' }
    }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Processing failure not found' });
  });

  it('clears only processing failures owned by the current user', async () => {
    mocked.destroy.mockResolvedValue(12);
    const res = createResponse();

    await controller.clearProcessingFailures(createRequest(), res);

    expect(mocked.destroy).toHaveBeenCalledWith({ where: { userId: 42 } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ deletedCount: 12 });
  });

  it('rejects cleanup without an authenticated user', async () => {
    const res = createResponse();

    await controller.clearProcessingFailures(createRequest({ userData: {} }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocked.destroy).not.toHaveBeenCalled();
  });
});
