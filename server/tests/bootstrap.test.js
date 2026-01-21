import { describe, it, expect } from 'vitest';
import db from '../models/index.js';

describe('Bootstrap', () => {
  it('connects to the database', async () => {
    await expect(db.sequelize.authenticate()).resolves.toBeUndefined();
  });
});