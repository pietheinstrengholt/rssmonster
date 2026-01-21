import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from "bcryptjs";
import db from '../models/index.js';

const { sequelize, User } = db;

describe('User model', () => {
  beforeAll(async () => {
    // Ensure clean state per file
    await sequelize.sync();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('creates a user', async () => {
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: 'testuser',
      password,
      hash,
      role: 'user'
    });

    expect(user.id).toBeDefined();
    expect(user.username).toBe('testuser');
  });
});