import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => {
  // Builds the persistence methods needed by user deletion orchestration.
  const createModel = () => ({
    destroy: vi.fn(),
    findAll: vi.fn()
  });

  return {
    bcryptHash: vi.fn(),
    createFeverApiKey: vi.fn(),
    createFeverCredentialHash: vi.fn(),
    models: {
      Action: createModel(),
      Article: createModel(),
      ArticleTopic: createModel(),
      Category: createModel(),
      Event: createModel(),
      EventTopic: createModel(),
      Feed: createModel(),
      GeneratedFeed: createModel(),
      Hotlink: createModel(),
      Island: createModel(),
      IslandTopic: createModel(),
      Setting: createModel(),
      SmartFolder: createModel(),
      Topic: createModel()
    },
    transaction: vi.fn(),
    userFindAll: vi.fn(),
    userFindByPk: vi.fn(),
    userFindOne: vi.fn()
  };
});

vi.mock('bcryptjs', () => ({
  default: {
    hash: mocked.bcryptHash
  }
}));

vi.mock('../../utils/apiCredentials.js', () => ({
  createFeverApiKey: mocked.createFeverApiKey,
  createFeverCredentialHash: mocked.createFeverCredentialHash
}));

vi.mock('../../models/index.js', async () => {
  const { Sequelize } = await vi.importActual('sequelize');

  return {
    default: {
      ...mocked.models,
      User: {
        findAll: mocked.userFindAll,
        findByPk: mocked.userFindByPk,
        findOne: mocked.userFindOne
      },
      sequelize: {
        transaction: mocked.transaction
      },
      Sequelize
    }
  };
});

const userController = (await import('../../controllers/user.js')).default;

// Builds an authenticated request with overridable params and body fields.
const createRequest = (overrides = {}) => ({
  userData: { userId: 1 },
  params: { userId: '2' },
  body: {},
  ...overrides
});

// Builds the chainable Express response contract used by user handlers.
const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
};

// Creates a persisted user double with update and delete behavior.
const createUserRecord = (overrides = {}) => ({
  id: 2,
  username: 'reader',
  role: 'user',
  update: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

// Resets all model and utility doubles to successful defaults.
const resetMocks = () => {
  mocked.userFindAll.mockReset();
  mocked.userFindByPk.mockReset();
  mocked.userFindOne.mockReset();
  mocked.bcryptHash.mockReset().mockResolvedValue('password-hash');
  mocked.createFeverApiKey.mockReset().mockReturnValue('fever-api-key');
  mocked.createFeverCredentialHash
    .mockReset()
    .mockReturnValue('fever-credential-hash');
  mocked.transaction.mockReset().mockImplementation(callback =>
    callback('transaction')
  );

  Object.values(mocked.models).forEach(model => {
    model.destroy.mockReset().mockResolvedValue(0);
    model.findAll.mockReset().mockResolvedValue([]);
  });
};

describe('user controller administration', () => {
  beforeEach(() => {
    resetMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('rejects the user list when authentication has no user ID', async () => {
    const res = createResponse();

    await userController.getUsers(
      createRequest({ userData: {} }),
      res
    );

    expect(mocked.userFindOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized: missing userId'
    });
  });

  it('allows only administrators to list credential-safe users', async () => {
    mocked.userFindOne.mockResolvedValueOnce({ id: 1, role: 'user' });
    const forbiddenRes = createResponse();

    await userController.getUsers(createRequest(), forbiddenRes);

    expect(forbiddenRes.status).toHaveBeenCalledWith(403);
    expect(mocked.userFindAll).not.toHaveBeenCalled();

    const users = [{ id: 1, username: 'admin' }];
    mocked.userFindOne.mockResolvedValueOnce({ id: 1, role: 'admin' });
    mocked.userFindAll.mockResolvedValue(users);
    const successRes = createResponse();

    await userController.getUsers(createRequest(), successRes);

    expect(mocked.userFindAll).toHaveBeenCalledWith({
      order: [['username', 'ASC']],
      attributes: {
        exclude: ['password', 'feverCredentialHash']
      }
    });
    expect(successRes.status).toHaveBeenCalledWith(200);
    expect(successRes.json).toHaveBeenCalledWith({ users });
  });

  it('returns a server error when the user list query fails', async () => {
    mocked.userFindOne.mockRejectedValue(new Error('query failed'));
    const res = createResponse();

    await userController.getUsers(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'query failed' });
  });

  it('returns not found without exposing credentials for a missing user', async () => {
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(null);
    const res = createResponse();

    await userController.getUser(createRequest(), res);

    expect(mocked.userFindByPk).toHaveBeenCalledWith('2', {
      attributes: {
        exclude: ['password', 'feverCredentialHash']
      }
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found.' });
  });

  it('rejects user reads without authentication or administrator access', async () => {
    const unauthorizedRes = createResponse();

    await userController.getUser(
      createRequest({ userData: {} }),
      unauthorizedRes
    );

    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'user' });
    const forbiddenRes = createResponse();

    await userController.getUser(createRequest(), forbiddenRes);

    expect(forbiddenRes.status).toHaveBeenCalledWith(403);
    expect(mocked.userFindByPk).not.toHaveBeenCalled();
  });

  it('returns an administrator-selected user', async () => {
    const user = createUserRecord();
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(user);
    const res = createResponse();

    await userController.getUser(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ user });
  });

  it('returns a server error when the selected-user query fails', async () => {
    mocked.userFindOne.mockRejectedValue(new Error('lookup failed'));
    const res = createResponse();

    await userController.getUser(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'lookup failed' });
  });

  it('rejects user updates from non-administrators', async () => {
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'user' });
    const res = createResponse();

    await userController.postUsers(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocked.userFindByPk).not.toHaveBeenCalled();
  });

  it('returns not found when an administrator updates a missing user', async () => {
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(null);
    const res = createResponse();

    await userController.postUsers(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
  });

  it('rotates password and Fever credentials together', async () => {
    const user = createUserRecord();
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(user);
    const req = createRequest({
      body: {
        username: 'updated-reader',
        role: 'admin',
        password: 'new-password'
      }
    });
    const res = createResponse();

    await userController.postUsers(req, res);

    expect(mocked.bcryptHash).toHaveBeenCalledWith('new-password', 10);
    expect(mocked.createFeverApiKey).toHaveBeenCalledWith(
      'updated-reader',
      'new-password'
    );
    expect(mocked.createFeverCredentialHash).toHaveBeenCalledWith(
      'fever-api-key'
    );
    expect(user.update).toHaveBeenCalledWith({
      username: 'updated-reader',
      role: 'admin',
      password: 'password-hash',
      feverCredentialHash: 'fever-credential-hash'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ user });
  });

  it('updates profile fields without changing credentials', async () => {
    const user = createUserRecord();
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(user);
    const res = createResponse();

    await userController.postUsers(
      createRequest({
        body: {
          username: 'renamed-reader',
          role: 'user'
        }
      }),
      res
    );

    expect(user.update).toHaveBeenCalledWith({
      username: 'renamed-reader',
      role: 'user'
    });
    expect(mocked.bcryptHash).not.toHaveBeenCalled();
    expect(mocked.createFeverApiKey).not.toHaveBeenCalled();
  });

  it('returns a server error when a user update fails', async () => {
    const user = createUserRecord({
      update: vi.fn().mockRejectedValue(new Error('update failed'))
    });
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(user);
    const res = createResponse();

    await userController.postUsers(
      createRequest({
        body: {
          username: 'reader',
          role: 'user'
        }
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'update failed' });
  });

  it('rejects user deletion from non-administrators', async () => {
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'user' });
    const res = createResponse();

    await userController.deleteUser(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access denied. Only admins can delete users.'
    });
    expect(mocked.userFindByPk).not.toHaveBeenCalled();
  });

  it('prevents administrators from deleting themselves', async () => {
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    const res = createResponse();

    await userController.deleteUser(
      createRequest({ params: { userId: '1' } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'You cannot delete your own account.'
    });
    expect(mocked.transaction).not.toHaveBeenCalled();
  });

  it('rejects deletion of a user that does not exist', async () => {
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(null);
    const res = createResponse();

    await userController.deleteUser(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
  });

  it('deletes user-owned graphs and direct rows in one transaction', async () => {
    const user = createUserRecord();
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(user);
    mocked.models.Article.findAll.mockResolvedValue([{ id: 10 }]);
    mocked.models.Event.findAll.mockResolvedValue([{ id: 20 }]);
    mocked.models.Topic.findAll.mockResolvedValue([{ id: 30 }]);
    mocked.models.Island.findAll.mockResolvedValue([{ id: 40 }]);
    const res = createResponse();

    await userController.deleteUser(createRequest(), res);

    expect(mocked.models.ArticleTopic.destroy).toHaveBeenCalledWith({
      where: { articleId: { [Op.in]: [10] } },
      transaction: 'transaction'
    });
    expect(mocked.models.EventTopic.destroy).toHaveBeenCalledWith({
      where: { eventId: { [Op.in]: [20] } },
      transaction: 'transaction'
    });
    expect(mocked.models.IslandTopic.destroy).toHaveBeenCalledWith({
      where: { islandId: { [Op.in]: [40] } },
      transaction: 'transaction'
    });
    expect(mocked.models.Setting.destroy).toHaveBeenCalledWith({
      where: { userId: 2 },
      transaction: 'transaction'
    });
    expect(mocked.models.GeneratedFeed.destroy).toHaveBeenCalledWith({
      where: { userId: 2 },
      transaction: 'transaction'
    });
    expect(user.destroy).toHaveBeenCalledWith({
      transaction: 'transaction'
    });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledOnce();
  });

  it('tolerates optional tables missing during user deletion', async () => {
    const missingTableError = Object.assign(
      new Error('table missing'),
      {
        name: 'SequelizeDatabaseError',
        original: { code: 'ER_NO_SUCH_TABLE' }
      }
    );
    const user = createUserRecord();
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(user);
    mocked.models.Article.findAll.mockRejectedValue(missingTableError);
    mocked.models.Setting.destroy.mockRejectedValue(missingTableError);
    const res = createResponse();

    await userController.deleteUser(createRequest(), res);

    expect(user.destroy).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(204);
    expect(console.warn).toHaveBeenCalledWith(
      '[deleteUser] Skipping articles: backing table does not exist'
    );
    expect(console.warn).toHaveBeenCalledWith(
      '[deleteUser] Skipping settings: backing table does not exist'
    );
  });

  it('rolls deletion failures back through the transaction error path', async () => {
    const user = createUserRecord();
    mocked.userFindOne.mockResolvedValue({ id: 1, role: 'admin' });
    mocked.userFindByPk.mockResolvedValue(user);
    mocked.models.Feed.destroy.mockRejectedValue(
      new Error('delete failed')
    );
    const res = createResponse();

    await userController.deleteUser(createRequest(), res);

    expect(user.destroy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'delete failed' });
  });
});
