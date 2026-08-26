import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readiness: {
    announce: vi.fn(),
    transitionTo: vi.fn()
  },
  server: { close: vi.fn(), once: vi.fn() },
  app: { locals: { embeddingService: {}, readiness: null }, listen: vi.fn() },
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
    mocks.app.locals.readiness = mocks.readiness;
    mocks.readiness.announce.mockReset();
    mocks.readiness.transitionTo.mockReset();
    mocks.server.close.mockReset().mockImplementation(callback => callback());
    mocks.server.once.mockReset();
    mocks.app.listen.mockReset().mockImplementation((_port, _host, callback) => {
      callback();
      return mocks.server;
    });
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
    const { startServer } = await import('../src/index.js');

    await expect(startServer()).resolves.toBe(mocks.server);
    handlers.SIGTERM('SIGTERM');
    handlers.SIGINT('SIGINT');

    expect(mocks.initializeConfiguredModels).toHaveBeenCalledWith({
      embeddingService: mocks.app.locals.embeddingService
    });
    expect(mocks.app.listen).toHaveBeenCalledWith(3030, '127.0.0.1', expect.any(Function));
    expect(mocks.readiness.announce).toHaveBeenCalledOnce();
    expect(mocks.readiness.transitionTo).toHaveBeenNthCalledWith(1, 'ready');
    expect(mocks.readiness.transitionTo).toHaveBeenNthCalledWith(2, 'shutting_down');
    expect(mocks.server.close).toHaveBeenCalledOnce();
    expect(mocks.readiness.transitionTo.mock.invocationCallOrder[1])
      .toBeLessThan(mocks.server.close.mock.invocationCallOrder[0]);
    expect(process.exitCode).toBeUndefined();
  });

  it('sets a failing exit code when shutdown fails', async () => {
    const closeError = new Error('close failed');
    mocks.server.close.mockImplementation(callback => callback(closeError));
    const { startServer } = await import('../src/index.js');

    await startServer();
    handlers.SIGINT('SIGINT');

    expect(errorSpy).toHaveBeenCalledWith('[INFERENCE] Shutdown failed:', { name: 'Error' });
    expect(process.exitCode).toBe(1);
  });

  it('opens the listener before configured model initialization resolves', async () => {
    let resolveInitialization;
    mocks.initializeConfiguredModels.mockReturnValue(new Promise(resolve => {
      resolveInitialization = resolve;
    }));
    const { startServer } = await import('../src/index.js');

    const startup = startServer();
    await vi.waitFor(() => expect(mocks.initializeConfiguredModels).toHaveBeenCalledOnce());

    expect(mocks.app.listen).toHaveBeenCalledOnce();
    expect(mocks.readiness.transitionTo).not.toHaveBeenCalledWith('ready');

    resolveInitialization();
    await startup;
    expect(mocks.readiness.transitionTo).toHaveBeenCalledWith('ready');
  });

  it('marks initialization failure and closes the listener before rejecting', async () => {
    const startupError = new Error('load failed');
    mocks.initializeConfiguredModels.mockRejectedValue(startupError);
    const { startServer } = await import('../src/index.js');

    await expect(startServer()).rejects.toBe(startupError);

    expect(mocks.readiness.transitionTo).toHaveBeenCalledWith('failed');
    expect(mocks.server.close).toHaveBeenCalledOnce();
    expect(mocks.readiness.transitionTo.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.server.close.mock.invocationCallOrder[0]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[INFERENCE] Model initialization failed:',
      { name: 'Error', message: 'load failed' }
    );
  });

  it('handles startup failure when loaded as the process entry point', async () => {
    process.env.pm_id = '0';
    const startupError = new Error('startup failed');
    mocks.initializeConfiguredModels.mockRejectedValue(startupError);

    await import('../src/index.js');

    expect(mocks.readiness.transitionTo).toHaveBeenCalledWith('failed');
    expect(mocks.server.close).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      '[INFERENCE] Startup failed:',
      { name: 'Error', message: 'startup failed' }
    );
    expect(process.exitCode).toBe(1);
  });
});
