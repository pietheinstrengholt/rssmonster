import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import db from '../models/index.js';

const { sequelize } = db;

let app;

describe('Express smoke test', () => {
  beforeAll(async () => {
    // IMPORTANT: env vars must be set BEFORE app import
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    // Dynamic import (ESM-safe)
    const mod = await import('../app.js');
    app = mod.default;

    if (!app) {
      throw new Error('Express app was not exported correctly');
    }

    await sequelize.authenticate();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('responds to health check', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
  });
});