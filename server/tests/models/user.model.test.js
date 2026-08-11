import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from "bcryptjs";
import db from '../../models/index.js';

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
      feverCredentialHash: `${username}-${hash}`,
      role: 'user'
    });

    expect(user.id).toBeDefined();
    expect(user.username).toBe(username);
  });

  it('omits stored credentials when serialized without hiding them internally', async () => {
    const username = uniqueName('serialized-user');
    const password = 'stored-password';
    const hash = `${username}-api-hash`;
    const user = await User.create({
      username,
      password,
      feverCredentialHash: hash,
      role: 'user'
    });

    expect(user.password).toBe(password);
    expect(user.feverCredentialHash).toBe(hash);
    expect(user.toJSON()).not.toHaveProperty('password');
    expect(user.toJSON()).not.toHaveProperty('feverCredentialHash');
    expect(user.toJSON()).not.toHaveProperty('bootstrapAdminClaim');
  });

  it('allows only one database-backed bootstrap administrator claim', async () => {
    const firstUsername = uniqueName('bootstrap-admin');
    const secondUsername = uniqueName('bootstrap-racer');
    const existingClaimOwner = await User.findOne({
      where: { bootstrapAdminClaim: true }
    });

    if (!existingClaimOwner) {
      await User.create({
        username: firstUsername,
        password: 'stored-password',
        feverCredentialHash: `${firstUsername}-api-hash`,
        role: 'admin',
        bootstrapAdminClaim: true
      });
    }

    await expect(User.create({
      username: secondUsername,
      password: 'stored-password',
      feverCredentialHash: `${secondUsername}-api-hash`,
      role: 'admin',
      bootstrapAdminClaim: true
    })).rejects.toMatchObject({
      name: 'SequelizeUniqueConstraintError'
    });
  });
});
