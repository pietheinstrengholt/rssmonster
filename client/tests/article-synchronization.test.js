import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArticleSynchronization } from '../src/services/articleSynchronization.js';
const account = { apiOrigin: 'https://reader.example', userId: 1 };
const action = { actionId: 'stable', articleId: 42, kind: 'set-status', value: 'read', attempts: 1 };
const fixture = (options = {}) => {
  let actions = [action];
  const database = { getActions: vi.fn(async () => actions), getSyncState: vi.fn(async () => ({})),
    dispatchActions: vi.fn(async () => actions), retryActions: vi.fn(),
    acknowledgeActions: vi.fn(async () => { actions = []; return true; }), completeSynchronization: vi.fn(async () => true) };
  const send = vi.fn(async () => ({ data: { results: [{ actionId: action.actionId, outcome: 'duplicate' }], articles: [{ id: 42, status: 'read' }] } }));
  const reconcile = vi.fn();
  const onStatus = vi.fn();
  const service = createArticleSynchronization({ database, send, validate: vi.fn(async () => ({ user: { id: 1 } })),
    coordinate: async (_account, work) => work({ owner: 'tab', epoch: 0 }), publish: vi.fn(), ...options });
  service.start({ account, token: 'captured-token', isCurrent: () => true, reconcile, onStatus });
  return { service, database, send, reconcile, onStatus };
};
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('article synchronization coordinator', () => {
  it('coalesces replay and marks success only after durable acknowledgement and counts', async () => {
    const { service, database, send, reconcile } = fixture();
    const first = service.request();
    expect(service.request()).toBe(first);
    expect(await first).toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith([{ actionId: 'stable', articleId: 42, kind: 'set-status', value: 'read' }], 'captured-token');
    expect(database.acknowledgeActions.mock.invocationCallOrder[0]).toBeLessThan(reconcile.mock.invocationCallOrder[0]);
    expect(reconcile.mock.invocationCallOrder[0]).toBeLessThan(database.completeSynchronization.mock.invocationCallOrder[0]);
    service.stop();
  });
  it('retains an ambiguous action unchanged and retries the same UUID after restart', async () => {
    vi.useFakeTimers();
    const { service, database, send } = fixture();
    send.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'Timeout after commit' });
    expect(await service.request()).toBe(false);
    expect(database.retryActions.mock.calls[0][2][0]).toBe(action);
    expect(database.acknowledgeActions).not.toHaveBeenCalled();
    expect(await service.request(true)).toBe(true);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
    service.stop();
  });
  it('fences an old response after account switching', async () => {
    let resolve;
    const { service, database, send } = fixture();
    send.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = service.request();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    service.stop();
    resolve({ data: { results: [], articles: [] } });
    expect(await pending).toBe(false);
    expect(database.acknowledgeActions).not.toHaveBeenCalled();
  });
  it('pauses on expired credentials and never acknowledges them', async () => {
    const expired = vi.fn(); window.addEventListener('auth:expired', expired);
    const { service, database, onStatus } = fixture({ validate: vi.fn().mockRejectedValue({ response: { status: 401 } }) });
    expect(await service.request()).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith('paused', 'Sign in to synchronize changes.');
    expect(database.dispatchActions).not.toHaveBeenCalled();
    service.stop(); window.removeEventListener('auth:expired', expired);
  });
  it('retries durable reconciliation after restart even with an empty queue', async () => {
    const { service, database, reconcile, send } = fixture();
    database.getActions.mockResolvedValue([]); database.dispatchActions.mockResolvedValue([]);
    database.getSyncState.mockResolvedValue({ needsReconciliation: true });
    expect(await service.request()).toBe(true);
    expect(send).not.toHaveBeenCalled(); expect(reconcile).toHaveBeenCalledOnce();
    service.stop();
  });
});
