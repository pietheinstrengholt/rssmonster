import { afterEach, describe, expect, it, vi } from 'vitest';
import { withOfflineAccountLease } from '../src/services/offlineCoordination.js';
import { createOfflineReadingService } from '../src/services/offlineReading.js';
import { createArticleStateActions } from '../src/services/articleStateActions.js';

const account = { apiOrigin: 'http://reader.example', userId: 1 };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const withoutNativeUUID = () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto', { getRandomValues });
};
afterEach(() => vi.unstubAllGlobals());

describe('offline reading without native randomUUID', () => {
  it('acquires and releases an account lease', async () => {
    withoutNativeUUID();
    const database = {
      acquireLease: vi.fn(async (_account, owner) => ({ owner, epoch: 0 })),
      releaseLease: vi.fn()
    };
    const work = vi.fn(async lease => lease.owner);
    const owner = await withOfflineAccountLease(account, work, database);
    expect(owner).toMatch(uuidPattern);
    expect(database.releaseLease).toHaveBeenCalledWith(account, { owner, epoch: 0 });
  });

  it('downloads and activates an article generation', async () => {
    withoutNativeUUID();
    let generation;
    let snapshot;
    const profile = { enabled: true, articleLimit: 100 };
    const database = {
      getProfile: async () => profile,
      beginGeneration: async (_account, _profile, id) => { generation = id; return true; },
      writeGeneration: async (_account, id, articles, activate) => {
        expect(id).toBe(generation);
        if (activate) snapshot = articles;
        return profile;
      }
    };
    const article = { id: 42, status: 'unread' };
    const fetchPage = async () => ({ data: { page: { itemIds: [42], articles: [article], hasMore: false } } });
    await createOfflineReadingService(database, fetchPage).refreshSnapshot(account);
    expect(generation).toMatch(uuidPattern);
    expect(snapshot).toEqual([article]);
  });

  it('queues read and saved changes with distinct action IDs', async () => {
    withoutNativeUUID();
    const enqueueActions = vi.fn(async () => {});
    const actions = createArticleStateActions({ enqueueActions }, vi.fn());
    actions.setSession(account, 0, () => true);
    const article = { id: 42, status: 'unread', savedInd: 0 };
    expect((await actions.assign([article], 'set-status', 'read')).data.status).toBe('read');
    expect((await actions.assign([article], 'set-saved', true)).data.savedInd).toBe(1);
    const ids = enqueueActions.mock.calls.map(call => call[1][0].actionId);
    for (const id of ids) expect(id).toMatch(uuidPattern);
    expect(new Set(ids).size).toBe(2);
  });
});
