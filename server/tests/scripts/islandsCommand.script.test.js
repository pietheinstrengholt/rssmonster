import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runIslandCalibration: vi.fn()
}));

vi.mock('../../services/islands/runIslandCalibration.js', () => ({
  runIslandCalibration: mocked.runIslandCalibration
}));

const originalScriptPath = process.argv[1];

describe('islands command', () => {
  beforeEach(() => {
    vi.resetModules();
    mocked.runIslandCalibration.mockReset().mockResolvedValue(undefined);
    process.argv[1] = originalScriptPath;
  });

  afterEach(() => {
    process.argv[1] = originalScriptPath;
    vi.restoreAllMocks();
  });

  // Programmatic callers can scope island calibration to one user.
  it('exposes the island pipeline for npm run islands', async () => {
    const { default: runIslandCalibration } = await import('../../scripts/runIslandsCommand.js');

    await runIslandCalibration({ userId: 42 });

    expect(mocked.runIslandCalibration).toHaveBeenCalledWith({ userId: 42 });
  });

  // The executable command reports both the processed user count and completion.
  it('runs island calibration from the CLI entry point', async () => {
    process.argv[1] = '/tmp/runIslandsCommand.js';
    mocked.runIslandCalibration.mockResolvedValue({ userCount: 3 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    await import('../../scripts/runIslandsCommand.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    expect(mocked.runIslandCalibration).toHaveBeenCalledWith();
    expect(logSpy).toHaveBeenCalledWith('[ISLANDS] Processed 3 users');
    expect(logSpy).toHaveBeenCalledWith('[ISLANDS] Done');
  });

  // An omitted user count still produces the standard completion message.
  it('completes the CLI command when calibration has no summary', async () => {
    process.argv[1] = '/tmp/runIslandsCommand.js';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    await import('../../scripts/runIslandsCommand.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Processed'));
    expect(logSpy).toHaveBeenCalledWith('[ISLANDS] Done');
  });

  // Calibration failures are logged and result in a non-zero process exit.
  it('reports CLI calibration failures', async () => {
    const failure = new Error('calibration failed');
    process.argv[1] = '/tmp/runIslandsCommand.js';
    mocked.runIslandCalibration.mockRejectedValue(failure);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    await import('../../scripts/runIslandsCommand.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
    expect(errorSpy).toHaveBeenCalledWith('[ISLANDS] Failed:', failure);
  });
});


