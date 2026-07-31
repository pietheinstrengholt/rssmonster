import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createGreaderActionToken: vi.fn(),
  createGreaderAuthToken: vi.fn(),
  findOne: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    User: {
      findOne: mocked.findOne
    }
  }
}));

vi.mock('../../utils/apiCredentials.js', () => ({
  createGreaderActionToken: mocked.createGreaderActionToken,
  createGreaderAuthToken: mocked.createGreaderAuthToken
}));

const {
  authenticateGreader,
  parseGreaderAuthorization,
  validateGreaderActionToken
} = await import('../../middleware/greaderAuth.js');

const VALID_TOKEN = 'a'.repeat(64);

// This function builds the chainable response contract used by the middleware.
const createResponse = () => {
  const res = {
    json: vi.fn(),
    send: vi.fn(),
    set: vi.fn(),
    status: vi.fn(),
    type: vi.fn()
  };
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.set.mockReturnValue(res);
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  return res;
};

describe('Google Reader authentication middleware', () => {
  beforeEach(() => {
    mocked.createGreaderActionToken.mockReset().mockReturnValue('action-token');
    mocked.createGreaderAuthToken.mockReset().mockReturnValue(VALID_TOKEN);
    mocked.findOne.mockReset();
  });

  it('parses both supported authorization prefixes', () => {
    expect(
      parseGreaderAuthorization(`GoogleLogin auth=reader/${VALID_TOKEN}`)
    ).toEqual({
      username: 'reader',
      token: VALID_TOKEN
    });
    expect(
      parseGreaderAuthorization(`GoogleLogin_auth=reader/${VALID_TOKEN}`)
    ).toEqual({
      username: 'reader',
      token: VALID_TOKEN
    });
  });

  it.each([
    ['non-string input', undefined],
    ['unsupported prefix', `Bearer reader/${VALID_TOKEN}`],
    ['missing username', `GoogleLogin auth=/${VALID_TOKEN}`],
    ['missing separator', `GoogleLogin auth=reader-${VALID_TOKEN}`],
    ['non-hex token', `GoogleLogin auth=reader/${'z'.repeat(64)}`]
  ])('rejects %s', (_label, authorization) => {
    expect(parseGreaderAuthorization(authorization)).toBeNull();
  });

  it('rejects malformed authentication before querying users', async () => {
    const res = createResponse();
    const next = vi.fn();

    await authenticateGreader({ headers: {} }, res, next);

    expect(mocked.findOne).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Google-Bad-Token', 'true');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.type).toHaveBeenCalledWith('text/plain');
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates a matching user and exposes the credential to later middleware', async () => {
    const user = { id: 7, username: 'reader', password: 'password-hash' };
    mocked.findOne.mockResolvedValueOnce(user);
    const req = {
      headers: {
        authorization: `GoogleLogin auth=reader/${VALID_TOKEN}`
      }
    };
    const next = vi.fn();

    await authenticateGreader(req, createResponse(), next);

    expect(mocked.findOne).toHaveBeenCalledWith({
      where: { username: 'reader' },
      attributes: ['id', 'username', 'password']
    });
    expect(mocked.createGreaderAuthToken).toHaveBeenCalledWith(user);
    expect(req.greaderUser).toBe(user);
    expect(req.greaderAuthToken).toBe(VALID_TOKEN);
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses a dummy credential comparison for unknown usernames', async () => {
    mocked.findOne.mockResolvedValueOnce(null);
    const res = createResponse();

    await authenticateGreader(
      {
        headers: {
          authorization: `GoogleLogin auth=missing/${VALID_TOKEN}`
        }
      },
      res,
      vi.fn()
    );

    expect(mocked.createGreaderAuthToken).toHaveBeenCalledWith({
      id: 0,
      password: 'invalid-google-reader-credential'
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a valid-shape token that does not match the user', async () => {
    mocked.findOne.mockResolvedValueOnce({
      id: 7,
      username: 'reader',
      password: 'password-hash'
    });
    mocked.createGreaderAuthToken.mockReturnValueOnce('b'.repeat(64));
    const res = createResponse();

    await authenticateGreader(
      {
        headers: {
          authorization: `GoogleLogin auth=reader/${VALID_TOKEN}`
        }
      },
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns a service error when the user lookup fails', async () => {
    const error = new Error('database unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocked.findOne.mockRejectedValueOnce(error);
    const res = createResponse();

    await authenticateGreader(
      {
        headers: {
          authorization: `GoogleLogin auth=reader/${VALID_TOKEN}`
        }
      },
      res,
      vi.fn()
    );

    expect(log).toHaveBeenCalledWith(
      'Error in authenticateGreader:',
      error
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication unavailable'
    });
    log.mockRestore();
  });

  it('accepts an action token from the request body', () => {
    const req = {
      body: { T: 'action-token' },
      query: {},
      greaderUser: { id: 7 },
      greaderAuthToken: VALID_TOKEN
    };
    const next = vi.fn();

    validateGreaderActionToken(req, createResponse(), next);

    expect(mocked.createGreaderActionToken).toHaveBeenCalledWith(
      req.greaderUser,
      VALID_TOKEN
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('falls back to a query action token and rejects a mismatch', () => {
    const res = createResponse();

    validateGreaderActionToken(
      {
        body: {},
        query: { T: 'wrong-token' },
        greaderUser: { id: 7 },
        greaderAuthToken: VALID_TOKEN
      },
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('rejects a missing action token', () => {
    const res = createResponse();

    validateGreaderActionToken(
      {
        body: {},
        query: {},
        greaderUser: { id: 7 },
        greaderAuthToken: VALID_TOKEN
      },
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });
});
