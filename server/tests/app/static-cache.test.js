import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import {
  IMMUTABLE_ASSET_CACHE_CONTROL,
  REVALIDATED_ENTRY_CACHE_CONTROL,
  createStaticCacheHeaders
} from '../../utils/staticCache.js';
import { serveServiceWorkerFallback } from '../../utils/serviceWorkerFallback.js';

let app;
let fixtureDirectory;

describe('production static cache headers', () => {
  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(join(tmpdir(), 'rssmonster-static-cache-'));
    await mkdir(join(fixtureDirectory, 'assets'));
    await Promise.all([
      writeFile(join(fixtureDirectory, 'assets', 'index-AbCd1234.js'), 'export default true;'),
      writeFile(join(fixtureDirectory, 'index.html'), '<main>RSSMonster</main>'),
      writeFile(join(fixtureDirectory, 'sw.js'), 'self.skipWaiting();'),
      writeFile(join(fixtureDirectory, 'registerSW.js'), 'export default true;'),
      writeFile(join(fixtureDirectory, 'manifest.webmanifest'), '{}'),
      writeFile(join(fixtureDirectory, 'push-sw.js'), ''),
      writeFile(join(fixtureDirectory, 'robots.txt'), 'User-agent: *')
    ]);

    app = express();
    app.use(express.static(fixtureDirectory, {
      setHeaders: createStaticCacheHeaders(fixtureDirectory)
    }));
    app.get('/sw.js', serveServiceWorkerFallback);
    // This route verifies API responses remain outside the static cache policy.
    app.get('/api/example', (request, response) => response.json({ ok: true }));
  });

  afterAll(async () => {
    await rm(fixtureDirectory, { recursive: true, force: true });
  });

  it('serves Vite assets with an immutable one-year policy and validators', async () => {
    const response = await request(app).get('/assets/index-AbCd1234.js');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(IMMUTABLE_ASSET_CACHE_CONTROL);
    expect(response.headers.etag).toBeTruthy();
    expect(response.headers['last-modified']).toBeTruthy();
  });

  it.each([
    '/index.html',
    '/sw.js',
    '/registerSW.js',
    '/manifest.webmanifest',
    '/push-sw.js'
  ])('serves the PWA control file %s with revalidation', async filePath => {
    const response = await request(app).get(filePath);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(REVALIDATED_ENTRY_CACHE_CONTROL);
    expect(response.headers.etag).toBeTruthy();
    expect(response.headers['last-modified']).toBeTruthy();
  });

  it('serves the built service worker before the development retirement fallback', async () => {
    const response = await request(app).get('/sw.js');

    expect(response.text).toBe('self.skipWaiting();');
    expect(response.text).not.toContain('self.registration.unregister()');
  });

  it('does not apply immutable caching to unrelated root files', async () => {
    const response = await request(app).get('/robots.txt');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).not.toContain('immutable');
  });

  it('does not apply immutable caching to API responses', async () => {
    const response = await request(app).get('/api/example');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
