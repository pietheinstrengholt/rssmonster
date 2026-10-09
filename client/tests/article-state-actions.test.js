import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArticleStateActions } from '../src/services/articleStateActions.js';
import { overlayPendingActions } from '../src/services/offlineDatabase.js';

const account = { apiOrigin: 'https://reader.example', userId: 1 };
const article = { id: 41, status: 'unread', favoriteInd: 0 };
afterEach(() => vi.unstubAllGlobals());
describe('durable article assignments', () => {
  it('publishes effective read and favorite state only after persistence completes', async () => {
    let complete;
    const database = { enqueueActions: vi.fn(() => new Promise(resolve => { complete = resolve; })) };
    const publish = vi.fn();
    const service = createArticleStateActions(database, publish);
    service.setSession(account, 3);
    const pending = service.assign([article], 'set-status', 'read');
    expect(publish).not.toHaveBeenCalled();
    complete();
    expect((await pending).data.status).toBe('read');
    expect(database.enqueueActions.mock.calls[0][0]).toEqual(account);
    expect(database.enqueueActions.mock.calls[0][1][0]).toMatchObject({ articleId: 41, kind: 'set-status', value: 'read', baseValue: 'unread' });
    expect(publish).toHaveBeenCalledOnce();
  });
  it('does not publish changes when quota or an aborted transaction rejects persistence', async () => {
    const publish = vi.fn();
    const service = createArticleStateActions({ enqueueActions: vi.fn().mockRejectedValue(new DOMException('Quota', 'QuotaExceededError')) }, publish);
    service.setSession(account, 0);
    await expect(service.assign([article], 'set-favorite', true)).rejects.toThrow('Quota');
    expect(publish).not.toHaveBeenCalled();
  });
  it('does not publish a completion under a switched account', async () => {
    let complete;
    const publish = vi.fn();
    const service = createArticleStateActions({ enqueueActions: () => new Promise(resolve => { complete = resolve; }) }, publish);
    service.setSession(account, 0);
    const pending = service.assign([article], 'set-status', 'unread');
    service.setSession({ ...account, userId: 2 }, 0);
    complete();
    await expect(pending).rejects.toThrow('account changed');
    expect(publish).not.toHaveBeenCalled();
  });
  it('overlays fields independently in local order and excludes terminal failures', () => {
    const actions = [
      { articleId: 41, kind: 'set-status', value: 'read', state: 'dispatched' },
      { articleId: 41, kind: 'set-favorite', value: true, state: 'pending' },
      { articleId: 41, kind: 'set-status', value: 'unread', state: 'pending' },
      { articleId: 41, kind: 'set-favorite', value: false, state: 'failed' }
    ];
    expect(overlayPendingActions([article], actions)).toEqual([{ ...article, status: 'unread', favoriteInd: 1 }]);
    expect(article.favoriteInd).toBe(0);
  });
});

it('keeps durable controls usable after an explicit discard transaction fails', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  const { useOfflineReadingStore } = await import('../src/store/offlineReading.js');
  const { offlineDatabase } = await import('../src/services/offlineDatabase.js');
  const { offlineReading } = await import('../src/services/offlineReading.js');
  const { articleStateActions } = await import('../src/services/articleStateActions.js');
  setActivePinia(createPinia());
  vi.stubGlobal('indexedDB', {});
  const store = useOfflineReadingStore();
  store.account = account;
  store.readOnly = true;
  const enqueue = vi.spyOn(offlineDatabase, 'enqueueActions').mockResolvedValue([]);
  vi.spyOn(offlineDatabase, 'discardActions').mockRejectedValue(new Error('Storage transaction failed'));
  vi.spyOn(offlineDatabase, 'getSyncState').mockResolvedValue({ epoch: 0 });
  vi.spyOn(offlineDatabase, 'getActions').mockResolvedValue([]);
  vi.spyOn(offlineReading, 'getProfile').mockResolvedValue(null);
  try {
    await expect(store.discardPendingChanges()).rejects.toThrow('Storage transaction failed');
    expect((await articleStateActions.assign([article], 'set-status', 'read')).data.status).toBe('read');
    expect(enqueue).toHaveBeenCalledOnce();
  } finally {
    articleStateActions.clearSession();
    const { articleSynchronization } = await import('../src/services/articleSynchronization.js');
    articleSynchronization.stop();
    vi.restoreAllMocks();
  }
});
