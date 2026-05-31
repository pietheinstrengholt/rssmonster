import { describe, expect, it } from 'vitest';
import db from '../models/index.js';

const { Feed, Hotlink, Setting, User } = db;

describe('model schema declarations', () => {
  it('keeps model uniqueness in sync with migrations', () => {
    expect(User.rawAttributes.username.unique).toBe(true);
    expect(User.rawAttributes.hash.unique).toBe(true);
    expect(Setting.rawAttributes.userId.unique).toBe(true);
    expect(Feed.options.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unique: true,
          fields: ['userId', 'url']
        })
      ])
    );
  });

  it('keeps hotlink timestamps in sync with migrations', () => {
    expect(Hotlink.rawAttributes.createdAt).toMatchObject({
      allowNull: true
    });
    expect(Hotlink.options.updatedAt).toBe(false);
    expect(Hotlink.options.createdAt).not.toBe(false);
  });

  it('declares required feed ownership columns explicitly', () => {
    expect(Feed.rawAttributes.userId.allowNull).toBe(false);
    expect(Feed.rawAttributes.categoryId.allowNull).toBe(false);
  });
});
