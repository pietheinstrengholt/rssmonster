import { beforeAll, describe, expect, it } from 'vitest';
import db from '../../models/index.js';

const { GeneratedFeed, User, sequelize } = db;

const uniqueValue = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const validToken = suffix => `${String(suffix).padEnd(43, 'a').slice(0, 43)}`;

const createUser = prefix => {
  const username = uniqueValue(prefix);
  return User.create({
    username,
    password: 'hashed-password',
    feverCredentialHash: `${username}-hash`,
    role: 'user'
  });
};

describe('GeneratedFeed model', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  it('persists required configuration and defaults', async () => {
    const user = await createUser('generated-feed-defaults');
    const generatedFeed = await GeneratedFeed.create({
      userId: user.id,
      name: 'Security News',
      expression: 'tag:security limit:50',
      token: validToken(uniqueValue('token'))
    });

    expect(generatedFeed).toMatchObject({
      userId: user.id,
      name: 'Security News',
      description: null,
      expression: 'tag:security limit:50',
      enabled: true
    });
    expect(generatedFeed.tokenRegeneratedAt).toBeInstanceOf(Date);
    expect(generatedFeed.createdAt).toBeInstanceOf(Date);
    expect(generatedFeed.updatedAt).toBeInstanceOf(Date);
  });

  it('enforces required fields and token uniqueness', async () => {
    const user = await createUser('generated-feed-constraints');
    const token = validToken(uniqueValue('shared-token'));

    await expect(GeneratedFeed.create({ userId: user.id }))
      .rejects.toMatchObject({ name: 'SequelizeValidationError' });

    await GeneratedFeed.create({
      userId: user.id,
      name: 'First',
      expression: 'unread:true limit:50',
      token
    });

    await expect(GeneratedFeed.create({
      userId: user.id,
      name: 'Second',
      expression: 'favorite:true limit:50',
      token
    })).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
  });

  it('rejects empty expressions and malformed bearer tokens at the model boundary', async () => {
    const user = await createUser('generated-feed-model-validation');
    const base = {
      userId: user.id,
      name: 'Invalid configuration',
      expression: 'unread:true',
      token: validToken(uniqueValue('valid-token'))
    };

    await expect(GeneratedFeed.create({ ...base, expression: '' }))
      .rejects.toMatchObject({ name: 'SequelizeValidationError' });
    await expect(GeneratedFeed.create({ ...base, token: 'too-short' }))
      .rejects.toMatchObject({ name: 'SequelizeValidationError' });
    await expect(GeneratedFeed.create({ ...base, token: '!'.repeat(43) }))
      .rejects.toMatchObject({ name: 'SequelizeValidationError' });
  });

  it('declares matching ownership and token indexes', () => {
    expect(GeneratedFeed.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'generated_feeds_userId_idx',
        fields: ['userId']
      }),
      expect.objectContaining({
        name: 'generated_feeds_token_unique',
        unique: true,
        fields: ['token']
      })
    ]));
  });

  it('uses the user ownership association and cascades deletes', async () => {
    const user = await createUser('generated-feed-association');
    const generatedFeed = await GeneratedFeed.create({
      userId: user.id,
      name: 'Owned Feed',
      expression: 'favorite:true limit:50',
      token: validToken(uniqueValue('association-token'))
    });

    expect(await generatedFeed.getUser()).toMatchObject({ id: user.id });
    expect(await user.getGeneratedFeeds()).toEqual([
      expect.objectContaining({ id: generatedFeed.id })
    ]);
    expect(User.associations.generatedFeeds).toMatchObject({
      as: 'generatedFeeds',
      foreignKey: 'userId'
    });
    expect(User.associations.generatedFeeds.options.onDelete).toBe('CASCADE');

    await user.destroy();

    expect(await GeneratedFeed.findByPk(generatedFeed.id)).toBeNull();
  });
});
