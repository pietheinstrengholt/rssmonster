import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: { locals: { embeddingService: {} }, listen: vi.fn() },
  getConfig: vi.fn(() => ({ host: '127.0.0.1', port: 3030 })),
  initializeConfiguredModels: vi.fn()
}));

vi.mock('../src/app.js', () => ({ default: mocks.app }));
vi.mock('../src/config/config.js', () => ({ getConfig: mocks.getConfig }));
vi.mock('../src/configuredModelStartup.js', () => ({
  initializeConfiguredModels: mocks.initializeConfiguredModels
}));

describe('inference server lifecycle', () => {
  let onceSpy;
  let logSpy;
  let errorSpy;
  let handlers;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.pm_id;
    process.exitCode = undefined;
    handlers = {};
    mocks.app.listen.mockReset();
    mocks.getConfig.mockClear();
    mocks.initializeConfiguredModels.mockReset().mockResolvedValue(undefined);
    onceSpy = vi.spyOn(process, 'once').mockImplementation((signal, handler) => {
      handlers[signal] = handler;
      return process;
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.pm_id;
    process.exitCode = undefined;
    onceSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('starts, logs, and performs shutdown only once', async () => {
    const server = { close: vi.fn(callback => callback()) };
    mocks.app.listen.mockImplementation((_port, _host, callback) => {
      callback();
      return server;
    });
    const { startServer } = await import('../src/index.js');

    await expect(startServer()).resolves.toBe(server);
    handlers.SIGTERM('SIGTERM');
    handlers.SIGINT('SIGINT');

    expect(mocks.initializeConfiguredModels).toHaveBeenCalledWith({
      embeddingService: mocks.app.locals.embeddingService
    });
    expect(mocks.app.listen).toHaveBeenCalledWith(3030, '127.0.0.1', expect.any(Function));
    expect(server.close).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
  });

  it('sets a failing exit code when shutdown fails', async () => {
    const closeError = new Error('close failed');
    const server = { close: vi.fn(callback => callback(closeError)) };
    mocks.app.listen.mockImplementation(() => server);
    const { startServer } = await import('../src/index.js');

    await startServer();
    handlers.SIGINT('SIGINT');

    expect(errorSpy).toHaveBeenCalledWith('[INFERENCE] Shutdown failed:', closeError);
    expect(process.exitCode).toBe(1);
  });

  it('handles startup failure when loaded as the process entry point', async () => {
    process.env.pm_id = '0';
    const startupError = new Error('startup failed');
    mocks.initializeConfiguredModels.mockRejectedValue(startupError);

    await import('../src/index.js');

    expect(errorSpy).toHaveBeenCalledWith('[INFERENCE] Startup failed:', startupError);
    expect(process.exitCode).toBe(1);
  });
});
