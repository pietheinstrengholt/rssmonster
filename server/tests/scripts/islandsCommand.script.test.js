import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runIslandCalibration: vi.fn()
}));

vi.mock('../../services/islands/runIslandCalibration.js', () => ({
  runIslandCalibration: mocked.runIslandCalibration
}));

describe('islands command', () => {
  beforeEach(() => {
    mocked.runIslandCalibration.mockReset();
  });

  it('exposes the island pipeline for npm run islands', async () => {
    const { default: runIslandCalibration } = await import('../../scripts/runIslandsCommand.js');

    await runIslandCalibration({ userId: 42 });

    expect(mocked.runIslandCalibration).toHaveBeenCalledWith({ userId: 42 });
  });
});



