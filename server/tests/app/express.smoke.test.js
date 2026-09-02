import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import db from '../../models/index.js';

const { sequelize } = db;

let app;

describe('Express smoke test', () => {
  beforeAll(async () => {
    // IMPORTANT: env vars must be set BEFORE app import
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    // Dynamic import (ESM-safe)
    const mod = await import('../../app.js');
    app = mod.default;

    if (!app) {
      throw new Error('Express app was not exported correctly');
    }

    await sequelize.authenticate();
  }, 50_000);

  it('responds to health check', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
  });

  it('retires stale application-shell workers when no built worker is available', async () => {
    const res = await request(app).get('/sw.js');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/javascript/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.text).toContain("self.addEventListener('activate'");
    expect(res.text).toContain('self.registration.unregister()');
    expect(res.text).not.toContain('NavigationRoute');
  });
});
