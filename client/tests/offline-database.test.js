import { afterEach, describe, expect, it, vi } from 'vitest';
import { offlineDatabase } from '../src/services/offlineDatabase.js';
import { createArticleStateActions } from '../src/services/articleStateActions.js';
import { createActionErrorDiagnostics } from '../src/services/actionErrorDiagnostics.js';

const account = { apiOrigin: 'https://reader.example', userId: 1 };
const lostTransaction = () => new DOMException('Attempt to get all index records from database without an in-progress transaction', 'UnknownError');

// Simulate the browser boundary, including a request succeeding before its transaction aborts.
const mockStorage = outcomes => {
  const connections = [];
  const open = vi.fn(() => {
    const outcome = outcomes[connections.length];
    const request = {};
    const database = {
      version: 4,
      close: vi.fn(),
      transaction: vi.fn(() => {
        if (outcome.creationError) throw outcome.creationError;
        const tx = { error: outcome.error };
        const read = () => {
          const readRequest = { result: outcome.result };
          queueMicrotask(() => {
            if (outcome.result !== undefined) readRequest.onsuccess();
            for (const error of [outcome.requestError, outcome.laterRequestError].filter(Boolean)) {
              tx.onerror({ target: { error, source: { name: 'account', objectStore: { name: 'pendingActions' } } } });
            }
            if (outcome.abort || outcome.error) tx.onabort();
            else tx.oncomplete();
          });
          return readRequest;
        };
        const store = { get: read, getAll: read, put: vi.fn() };
        store.index = () => store;
        tx.objectStore = () => store;
        return tx;
      })
    };
    connections.push(database);
    request.result = database;
    queueMicrotask(() => request.onsuccess());
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  vi.stubGlobal('IDBKeyRange', { only: value => value });
  return { open, connections };
};

afterEach(() => vi.unstubAllGlobals());

describe('offline storage recovery', () => {
  it.each([
    lostTransaction(),
    new DOMException('Connection to Indexed Database server lost.', 'UnknownError')
  ])('recovers the pending article overlay after $message', async error => {
    const { open, connections } = mockStorage([
      { error, result: [] },
      { result: [{ articleId: 41, kind: 'set-status', value: 'read', state: 'pending' }] }
    ]);
    const service = createArticleStateActions();
    service.setSession(account, 0);
    await expect(service.overlay([{ id: 41, status: 'unread' }])).resolves.toEqual([{ id: 41, status: 'read' }]);
    expect(open).toHaveBeenCalledTimes(2);
    for (const connection of connections) expect(connection.close).toHaveBeenCalledOnce();
    expect(connections[0].close.mock.invocationCallOrder[0]).toBeLessThan(connections[1].transaction.mock.invocationCallOrder[0]);
  });

  it('surfaces a persistent storage failure after one retry', async () => {
    const error = lostTransaction();
    const { open, connections } = mockStorage([{ error }, { error }]);
    await expect(offlineDatabase.getActions(account)).rejects.toBe(error);
    expect(open).toHaveBeenCalledTimes(2);
    for (const connection of connections) expect(connection.close).toHaveBeenCalledOnce();
  });

  it.each([
    new DOMException('No space left', 'QuotaExceededError'),
    new DOMException('Offline storage transaction aborted.', 'AbortError'),
    new DOMException('Another storage error', 'UnknownError')
  ])('does not retry unrelated $name failures', async error => {
    const { open } = mockStorage([{ error }]);
    await expect(offlineDatabase.getActions(account)).rejects.toBe(error);
    expect(open).toHaveBeenCalledOnce();
  });

  it('does not replay a failed write', async () => {
    const error = lostTransaction();
    const { open, connections } = mockStorage([{ error }]);
    await expect(offlineDatabase.updateProfile(account, { enabled: true })).rejects.toBe(error);
    expect(open).toHaveBeenCalledOnce();
    expect(connections[0].close).toHaveBeenCalledOnce();
  });

  it('closes the connection when transaction creation fails', async () => {
    const error = new DOMException('The database connection is closing.', 'InvalidStateError');
    const { connections } = mockStorage([{ creationError: error }]);
    await expect(offlineDatabase.getActions(account)).rejects.toBe(error);
    expect(connections[0].close).toHaveBeenCalledOnce();
  });

  it('returns a successful read without retrying', async () => {
    const { open } = mockStorage([{ result: [] }]);
    await expect(offlineDatabase.getActions(account)).resolves.toEqual([]);
    expect(open).toHaveBeenCalledOnce();
  });

  it('preserves the request failure when Safari aborts without a transaction error', async () => {
    const requestError = Object.assign(new DOMException('Storage failed https://storage.example/db?token=private-token Bearer private-auth', 'UnknownError'), {
      credentials: 'private-credentials', article: { title: 'Private article' }
    });
    mockStorage([{ abort: true, requestError, laterRequestError: new DOMException('Request cancelled', 'AbortError') }]);
    const error = await offlineDatabase.getActions(account).catch(error => error);
    expect(error.message).toBe('Offline storage transaction aborted.');
    const report = createActionErrorDiagnostics('Reconciliation failed', error);
    const [attempt] = JSON.parse(report).storageAttempts;
    expect(attempt).toMatchObject({ operation: 'getActions', mode: 'readonly', attempt: 1, phase: 'abort',
      databaseVersion: 4, visibilityAtStart: 'visible', visibilityAtTransactionStart: 'visible', visibilityAtFailure: 'visible',
      transactionError: null, requestStore: 'pendingActions', requestIndex: 'account',
      requestError: { name: 'UnknownError' } });
    expect(attempt.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(attempt.openElapsedMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(Date.parse(attempt.startedAt))).toBe(true);
    expect(Number.isFinite(Date.parse(attempt.failedAt))).toBe(true);
    for (const value of ['private-token', 'private-auth', 'private-credentials', 'Private article', 'reader.example', 'userId']) expect(report).not.toContain(value);
  });

  it('includes both storage attempts when the fresh-connection retry also fails', async () => {
    mockStorage([{ error: lostTransaction() }, { abort: true }]);
    const error = await offlineDatabase.getActions(account).catch(error => error);
    const report = JSON.parse(createActionErrorDiagnostics('Reconciliation failed', error));
    expect(report.storageAttempts).toMatchObject([
      { attempt: 1, phase: 'abort', transactionError: { name: 'UnknownError' } },
      { attempt: 2, phase: 'abort', transactionError: null, requestError: null }
    ]);
    expect(report.recentOfflineEvents).toContainEqual(expect.objectContaining({ event: 'storage-retry', operation: 'getActions', attempt: 2 }));
  });

  it('distinguishes an opening failure from a transaction creation failure', async () => {
    const error = new DOMException('Storage unavailable', 'InvalidStateError');
    vi.stubGlobal('indexedDB', { open: () => { throw error; } });
    await expect(offlineDatabase.getActions(account)).rejects.toBe(error);
    expect(JSON.parse(createActionErrorDiagnostics('Storage failed', error)).storageAttempts[0].phase).toBe('open');
    mockStorage([{ creationError: error }]);
    await expect(offlineDatabase.getActions(account)).rejects.toBe(error);
    expect(JSON.parse(createActionErrorDiagnostics('Storage failed', error)).storageAttempts[0].phase).toBe('create-transaction');
  });
});
