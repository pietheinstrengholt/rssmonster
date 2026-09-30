import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import actionController from '../../controllers/action.js';
import { resolveArticleActions } from '../../services/crawl/enrichment/articleActions.js';
import applyActions from '../../services/crawl/enrichment/applyActions.js';

const { Action, User, sequelize } = db;
const userIds = [];

const createUser = async username => {
  const user = await User.create({
    username,
    password: 'test-password',
    feverCredentialHash: `action-test-${username}`
  });
  userIds.push(user.id);
  return user;
};

describe('action replacement persistence', () => {
  beforeAll(async () => {
    if (sequelize.getDialect() === 'sqlite') await sequelize.sync();
  });

  afterEach(async () => {
    Action.removeHook('afterBulkCreate', 'fail-action-replacement');
    await User.destroy({ where: { id: userIds.splice(0) } });
  });

  it('preserves submitted rule priority in the editor and crawler after saving again', async () => {
    const owner = await createUser('action-order-owner');
    const other = await createUser('action-order-other');
    await Action.create({ userId: other.id, name: 'Other user', actionType: 'read', regularExpression: 'topic' });
    const save = async actions => {
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      await actionController.createAction({ userData: { userId: owner.id }, body: { actions } }, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    };
    const rules = [
      { name: 'Save first', actionType: 'favorite', regularExpression: '/topic/i' },
      { name: 'Discard next', actionType: 'discard', regularExpression: '/topic/i' }
    ];
    for (const ordered of [rules, [...rules].reverse()]) {
      await save(ordered);
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await actionController.getActions({ userData: { userId: owner.id } }, res, vi.fn());
      expect(res.json.mock.calls[0][0].actions.map(action => action.name)).toEqual(ordered.map(action => action.name));
      const crawlRules = await resolveArticleActions({ userId: owner.id });
      expect(crawlRules.map(action => action.name)).toEqual(ordered.map(action => action.name));
      expect(applyActions(crawlRules, { title: 'topic' }).favoriteInd).toBe(ordered[0].actionType === 'favorite' ? 1 : 0);
    }
    expect(await Action.count({ where: { userId: other.id } })).toBe(1);
  });

  it('restores the previous rules when replacement fails after insertion', async () => {
    const owner = await createUser('action-rollback-owner');
    const otherUser = await createUser('action-rollback-other');
    await Action.bulkCreate([owner, otherUser].map(user => ({
      userId: user.id,
      name: 'Original rule',
      actionType: 'read',
      regularExpression: 'original'
    })));
    const original = await Action.findAll({
      where: { userId: userIds }, order: [['id', 'ASC']], raw: true
    });
    const error = new Error('replacement failed after insertion');
    Action.addHook('afterBulkCreate', 'fail-action-replacement', () => { throw error; });
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await actionController.createAction({
      userData: { userId: owner.id },
      body: { actions: [{ name: 'Replacement', actionType: 'favorite', regularExpression: 'new' }] }
    }, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(await Action.findAll({
      where: { userId: userIds }, order: [['id', 'ASC']], raw: true
    })).toEqual(original);
  });
});
