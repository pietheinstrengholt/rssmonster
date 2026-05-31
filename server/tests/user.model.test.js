import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from "bcryptjs";
import db from '../models/index.js';

const { sequelize, User } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('User model', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  it('creates a user', async () => {
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    const username = uniqueName('testuser');

    const user = await User.create({
      username,
      password,
      hash: `${username}-${hash}`,
      role: 'user'
    });

    expect(user.id).toBeDefined();
    expect(user.username).toBe(username);
  });
});
