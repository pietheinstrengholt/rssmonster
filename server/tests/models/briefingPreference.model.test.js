import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';

const { sequelize, BriefingPreference, User } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates a persisted user for preference ownership tests.
async function createUser(prefix) {
  const password = 'secret';
  const hash = await bcrypt.hash(password, 10);
  const username = uniqueName(prefix);

  return User.create({
    username,
    password,
    hash: `${username}-${hash}`,
    role: 'user'
  });
}

describe('BriefingPreference model', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  it('persists the Daily Briefing defaults', async () => {
    const user = await createUser('briefing-defaults');
    const preference = await BriefingPreference.create({ userId: user.id });

    expect(preference).toMatchObject({
      userId: user.id,
      includeOnlyUnreadArticles: false,
      includeDevelopingEvents: false,
      showOnlyInterestMatchedArticles: false,
      showOnlyDevelopingEventArticles: false,
      minDistinctSources: 1,
      prioritizeHighTrust: false,
      selectionPeriod: '7d'
    });
    expect(preference.createdAt).toBeInstanceOf(Date);
    expect(preference.updatedAt).toBeInstanceOf(Date);
  });

  it('declares only the supported selection periods', () => {
    expect(BriefingPreference.rawAttributes.selectionPeriod.values).toEqual(['24h', '7d']);
  });

  it('does not expose the retired muted-interest field', () => {
    expect(BriefingPreference.rawAttributes).not.toHaveProperty('mutedInterestIslands');
  });

  it('enforces one preference row per user', async () => {
    const user = await createUser('briefing-unique');

    await BriefingPreference.create({ userId: user.id });

    await expect(BriefingPreference.create({ userId: user.id })).rejects.toMatchObject({
      name: 'SequelizeUniqueConstraintError'
    });
  });

  it('uses the user ownership association and cascades deletes', async () => {
    const user = await createUser('briefing-association');
    const preference = await BriefingPreference.create({ userId: user.id });

    expect(await preference.getUser()).toMatchObject({ id: user.id });
    expect(await user.getBriefingPreference()).toMatchObject({ id: preference.id });
    expect(User.associations.briefingPreference).toMatchObject({
      as: 'briefingPreference',
      foreignKey: 'userId'
    });
    expect(User.associations.briefingPreference.options.onDelete).toBe('CASCADE');

    await user.destroy();

    expect(await BriefingPreference.findByPk(preference.id)).toBeNull();
  });
});
