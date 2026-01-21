import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// IMPORTANT: must be set BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DISABLE_LISTENER = 'true';

import app from '../app.js';
import db from '../models/index.js';

const { sequelize } = db;

describe('Express smoke test', () => {
  beforeAll(async () => {
    // Ensure DB is reachable (app startup already authenticated)
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