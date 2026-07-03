import { describe, expect, it } from 'vitest';

import db from '../models/index.js';

const { User, Island } = db;

const FIXTURE_USERNAME = 'semantic-regression-user';

describe('semantic regression island architecture guard', () => {
  it('does not create islands during baseline article event topic replay', async () => {
    const user = await User.findOne({
      where: { username: FIXTURE_USERNAME },
      attributes: ['id'],
      raw: true
    });

    expect(user, 'semantic regression baseline user should exist before island guard').toBeTruthy();

    const islandCount = await Island.count({ where: { userId: user.id } });

    expect(islandCount).toBe(0);
  });
});
