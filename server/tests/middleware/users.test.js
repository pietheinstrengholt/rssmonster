import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  getJwtSecret: vi.fn(),
  verify: vi.fn(),
  userFindByPk: vi.fn()
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: mocked.verify
  }
}));

vi.mock('../../config/auth.js', () => ({
  getJwtSecret: mocked.getJwtSecret
}));

vi.mock('../../models/index.js', () => ({
  default: {
    User: { findByPk: mocked.userFindByPk }
  }
}));

const userMiddleware = (await import('../../middleware/users.js')).default;

// Builds the response contract used by registration and session validation.
const createResponse = () => {
  const res = {
    status: vi.fn(),
    send: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
};

describe('user authentication middleware', () => {
  beforeEach(() => {
    process.env.EMAIL_ENABLED = 'false';
    mocked.getJwtSecret.mockReset().mockReturnValue('jwt-secret');
    mocked.verify.mockReset();
    mocked.userFindByPk.mockReset().mockResolvedValue({
      id: 42,
      passwordChangedAt: null
    });
  });

  it('validates registration usernames, passwords, and confirmation', () => {
    const invalidUsernameRes = createResponse();
    userMiddleware.validateRegister(
      { body: { username: 'ab' } },
      invalidUsernameRes,
      vi.fn()
    );
    expect(invalidUsernameRes.send).toHaveBeenCalledWith({
      message: 'Please enter a username with min. 3 chars'
    });

    const invalidPasswordRes = createResponse();
    userMiddleware.validateRegister(
      { body: { username: 'reader', password: 'short' } },
      invalidPasswordRes,
      vi.fn()
    );
    expect(invalidPasswordRes.send).toHaveBeenCalledWith({
      message: 'Please enter a password with min. 6 chars'
    });

    const mismatchRes = createResponse();
    userMiddleware.validateRegister(
      {
        body: {
          username: 'reader',
          password: 'password',
          password_repeat: 'different'
        }
      },
      mismatchRes,
      vi.fn()
    );
    expect(mismatchRes.send).toHaveBeenCalledWith({
      message: 'Both passwords must match'
    });
  });

  it('continues registration when the complete payload is valid', () => {
    const next = vi.fn();
    const res = createResponse();

    userMiddleware.validateRegister(
      {
        body: {
          username: 'reader',
          password: 'password',
          password_repeat: 'password'
        }
      },
      res,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('requires and normalizes registration email only when email is enabled', () => {
    process.env.EMAIL_ENABLED = 'true';
    const missingRes = createResponse();

    userMiddleware.validateRegister({
      body: {
        username: 'reader',
        password: 'password',
        password_repeat: 'password'
      }
    }, missingRes, vi.fn());
    expect(missingRes.send).toHaveBeenCalledWith({
      message: 'Please enter an email address.'
    });

    const next = vi.fn();
    const request = {
      body: {
        username: 'reader',
        email: ' Reader@Example.COM ',
        password: 'password',
        password_repeat: 'password'
      }
    };
    userMiddleware.validateRegister(request, createResponse(), next);

    expect(request.body.email).toBe('reader@example.com');
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects sessions without an authorization header', async () => {
    const res = createResponse();

    await userMiddleware.isLoggedIn({ headers: {} }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Your session is not valid!'
    });
    expect(mocked.verify).not.toHaveBeenCalled();
  });

  it('decodes valid bearer sessions and attaches their user data', async () => {
    const decoded = { userId: 42, username: 'reader' };
    mocked.verify.mockReturnValue(decoded);
    const req = {
      headers: {
        authorization: 'Bearer signed-token'
      }
    };
    const next = vi.fn();

    await userMiddleware.isLoggedIn(req, createResponse(), next);

    expect(mocked.verify).toHaveBeenCalledWith(
      'signed-token',
      'jwt-secret'
    );
    expect(req.userData).toBe(decoded);
    expect(next).toHaveBeenCalledOnce();
    expect(mocked.userFindByPk).toHaveBeenCalledWith(42, {
      attributes: ['id', 'passwordChangedAt']
    });
  });

  it('rejects malformed or unverifiable sessions', async () => {
    mocked.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const res = createResponse();

    await userMiddleware.isLoggedIn(
      {
        headers: {
          authorization: 'Bearer invalid-token'
        }
      },
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Your session is not valid!'
    });
  });

  it('rejects a session issued before the current password version', async () => {
    mocked.verify.mockReturnValue({
      userId: 42,
      username: 'reader',
      passwordChangedAt: null
    });
    mocked.userFindByPk.mockResolvedValue({
      id: 42,
      passwordChangedAt: new Date('2026-09-02T12:00:00Z')
    });
    const res = createResponse();
    const next = vi.fn();

    await userMiddleware.isLoggedIn({
      headers: { authorization: 'Bearer old-token' }
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
