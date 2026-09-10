import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import db from '../../models/index.js';
import { startServer, stopServer } from '../../app.js';

const listeners = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(listeners.splice(0).map(stopServer));
});

describe('programmatic Express lifecycle', () => {
  it.each([
    { ALLOW_REGISTRATION: 'invalid' },
    { LOCAL_AUTH_ENABLED: 'false', OIDC_ENABLED: 'false' },
    { OIDC_ENABLED: 'true', OIDC_ISSUER_URL: '' }
  ])('rejects invalid authentication configuration before connecting to the database: %j', async environment => {
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
    const authenticate = vi.spyOn(db.sequelize, 'authenticate');
    await expect(startServer({ host: '127.0.0.1', port: 0 }))
      .rejects.toMatchObject({ code: 'AUTH_CONFIGURATION_INVALID' });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('returns a ready loopback listener, serves an absolute bundle path and closes it', async () => {
    vi.stubEnv('DISABLE_LISTENER', 'false');
    vi.stubEnv('ENABLE_HTTPS', 'false');
    const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-static-'));
    try {
      await writeFile(path.join(directory, 'index.html'), '<title>Local bundle</title>');
      const server = await startServer({ host: '127.0.0.1', port: 0, staticDirectory: directory });
      listeners.push(server);
      expect(server.address().address).toBe('127.0.0.1');
      const origin = `http://127.0.0.1:${server.address().port}`;
      expect(await (await fetch(origin)).text()).toContain('Local bundle');
      await expect(startServer({ host: '127.0.0.1', port: server.address().port }))
        .rejects.toMatchObject({ code: 'EADDRINUSE' });
      await stopServer(server);
      await expect(fetch(origin)).rejects.toThrow();
      await expect(stopServer(server)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects database errors so the host can clean up', async () => {
    vi.spyOn(db.sequelize, 'authenticate').mockRejectedValue(new Error('Database unavailable'));
    await expect(startServer({ host: '127.0.0.1', port: 0 })).rejects.toThrow('Database unavailable');
  });

  it('preserves the existing disabled-listener mode', async () => {
    vi.stubEnv('DISABLE_LISTENER', 'true');
    await expect(startServer()).resolves.toBeUndefined();
  });
});
