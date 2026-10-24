import { afterEach, describe, expect, it, vi } from 'vitest';
import { offlineDatabase } from '../src/services/offlineDatabase.js';
import { createArticleStateActions } from '../src/services/articleStateActions.js';

const account = { apiOrigin: 'https://reader.example', userId: 1 };
const lostTransaction = () => new DOMException('Attempt to get all index records from database without an in-progress transaction', 'UnknownError');

// Simulate the browser boundary, including a request succeeding before its transaction aborts.
const mockStorage = outcomes => {
  const connections = [];
  const open = vi.fn(() => {
    const outcome = outcomes[connections.length];
    const request = {};
    const database = {
      close: vi.fn(),
      transaction: vi.fn(() => {
        if (outcome.creationError) throw outcome.creationError;
        const tx = { error: outcome.error };
        const read = () => {
          const readRequest = { result: outcome.result };
          queueMicrotask(() => {
            if (outcome.result !== undefined) readRequest.onsuccess();
            if (outcome.error) tx.onabort();
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
});
