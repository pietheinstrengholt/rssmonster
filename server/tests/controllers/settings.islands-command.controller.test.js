import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runIslandCalibration: vi.fn()
}));

vi.mock('../../scripts/runIslandsCommand.js', () => ({
  default: mocked.runIslandCalibration
}));

const { recalculateIslands } = await import('../../controllers/setting.js');

// Creates a chainable response recorder for direct controller tests.
function responseRecorder() {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('settings island recalculation', () => {
  beforeEach(() => {
    mocked.runIslandCalibration.mockReset();
    vi.restoreAllMocks();
  });

  it('runs the islands command for only the authenticated user', async () => {
    mocked.runIslandCalibration.mockResolvedValue({
      islandCount: 3,
      articleCount: 7,
      enrichedIslandCount: 2,
      islandTopicLinkCount: 4,
      rescoredArticleCount: 6,
      profiles: [{ omitted: 'from response' }]
    });
    const res = responseRecorder();

    await recalculateIslands({ userData: { userId: 42 } }, res);

    expect(mocked.runIslandCalibration).toHaveBeenCalledWith({ userId: 42 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Interest islands recalculated',
      islandCount: 3,
      articleCount: 7,
      enrichedIslandCount: 2,
      islandTopicLinkCount: 4,
      rescoredArticleCount: 6
    });
  });

  it('rejects missing ownership without running the command', async () => {
    const res = responseRecorder();

    await recalculateIslands({ userData: {} }, res);

    expect(mocked.runIslandCalibration).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('reports command failures', async () => {
    const internalError = new Error('SQLITE_ERROR: no such column: secret_schema');
    mocked.runIslandCalibration.mockRejectedValue(internalError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = responseRecorder();

    await recalculateIslands({ userData: { userId: 42 } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to recalculate interest islands'
    });
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('secret_schema') })
    );
    expect(consoleError).toHaveBeenCalledWith('Error in recalculateIslands:', internalError);
  });
});
