import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { Category, Feed, User, sequelize } = db;

let app;
let userSequence = 0;

const createUser = username => {
  userSequence += 1;
  const uniqueUsername = `${username}-${userSequence}`;

  return User.create({
    username: uniqueUsername,
    password: 'hashed-password',
    hash: `${uniqueUsername}-hash`
  });
};

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

const createCategoryWithFeed = async user => {
  const category = await Category.create({
    userId: user.id,
    name: `${user.username} category`,
    categoryOrder: 1
  });

  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${user.username} feed`,
    url: `https://example.com/${user.username}.xml`
  });

  return { category, feed };
};

describe('category ownership authorization', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('GET category by ID rejects foreign-user category', async () => {
    const owner = await createUser('category-owner');
    const foreignUser = await createUser('category-viewer');
    const { category } = await createCategoryWithFeed(owner);

    const res = await request(app)
      .get(`/api/categories/${category.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
  });

  it('POST category creates a category with its selected icon', async () => {
    const owner = await createUser('category-create-owner');

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', authHeaderFor(owner))
      .send({
        name: 'Technology',
        iconName: 'cpu-fill'
      });

    const category = await Category.findByPk(res.body.id);

    expect(res.status).toBe(201);
    expect(res.body.iconName).toBe('cpu-fill');
    expect(category.iconName).toBe('cpu-fill');
  });

  it('PUT category by ID rejects foreign-user category', async () => {
    const owner = await createUser('category-owner');
    const foreignUser = await createUser('category-editor');
    const { category } = await createCategoryWithFeed(owner);

    const res = await request(app)
      .put(`/api/categories/${category.id}`)
      .set('Authorization', authHeaderFor(foreignUser))
      .send({
        name: 'Updated by foreign user',
        categoryOrder: 99
      });

    await category.reload();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
    expect(category.name).toBe(`${owner.username} category`);
    expect(category.categoryOrder).toBe(1);
  });

  it('PUT category by ID updates the owner category icon', async () => {
    const owner = await createUser('category-icon-owner');
    const { category } = await createCategoryWithFeed(owner);

    const res = await request(app)
      .put(`/api/categories/${category.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({
        name: category.name,
        categoryOrder: category.categoryOrder,
        iconName: 'newspaper'
      });

    await category.reload();

    expect(res.status).toBe(200);
    expect(res.body.iconName).toBe('newspaper');
    expect(category.iconName).toBe('newspaper');
  });

  it('DELETE category by ID rejects foreign-user category', async () => {
    const owner = await createUser('category-owner');
    const foreignUser = await createUser('category-deleter');
    const { category, feed } = await createCategoryWithFeed(owner);

    const res = await request(app)
      .delete(`/api/categories/${category.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    const persistedCategory = await Category.findByPk(category.id);
    const persistedFeed = await Feed.findByPk(feed.id);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
    expect(persistedCategory).not.toBeNull();
    expect(persistedFeed).not.toBeNull();
  });
});
