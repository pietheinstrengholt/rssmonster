import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = (username, role = 'user') => User.create({
  username,
  password: 'hashed-password',
  hash: `${username}-hash`,
  role
});

const authHeaderFor = user => {
  const token = jwt.sign(
    {
      username: user.username,
      userId: user.id
    },
    getJwtSecret()
  );

  return `Bearer ${token}`;
};

describe('user admin authorization', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('GET user by ID allows admins even when the token has no role claim', async () => {
    const admin = await createUser(uniqueName('admin'), 'admin');
    const target = await createUser(uniqueName('target'));

    const res = await request(app)
      .get(`/api/users/${target.id}`)
      .set('Authorization', authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(target.id);
    expect(res.body.user.username).toBe(target.username);
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('hash');
  });

  it('GET user by ID rejects non-admin users', async () => {
    const nonAdmin = await createUser(uniqueName('viewer'));
    const target = await createUser(uniqueName('target'));

    const res = await request(app)
      .get(`/api/users/${target.id}`)
      .set('Authorization', authHeaderFor(nonAdmin));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Access denied. Only admins can view all users.'
    });
  });
});
