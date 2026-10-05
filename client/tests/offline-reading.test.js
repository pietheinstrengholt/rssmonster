import { describe, expect, it, vi } from 'vitest';
import { createOfflineReadingService, latestOfflineSelection } from '../src/services/offlineReading.js';
import { upgradeOfflineDatabase } from '../src/services/offlineDatabase.js';

const account = { apiOrigin: 'https://reader.example', userId: 1 };
const article = id => ({ id, publishedAt: '2026-10-01T12:00:00Z', content: '<p>Downloaded text</p>', status: id % 2 ? 'read' : 'unread' });
const createDatabase = () => {
  let profile = { ...account, enabled: true, articleLimit: 100, activeGeneration: 'old', preparedArticleCount: 1 };
  const generations = new Map([['old', [article(1)]]]);
  return {
    getProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async (scope, changes) => (profile = { ...profile, ...scope, ...changes })),
    beginGeneration: vi.fn(async (scope, expected, generation) => { profile = { ...profile, pendingGeneration: generation }; return true; }),
    writeGeneration: vi.fn(async (scope, generation, articles, activate) => {
      if (!profile?.enabled || profile.pendingGeneration !== generation) return false;
      generations.set(generation, activate ? articles : [...(generations.get(generation) || []), ...articles]);
      if (!activate) return true;
      profile = { ...profile, status: 'ready', pendingGeneration: null, activeGeneration: generation, preparedArticleCount: articles.length };
      for (const key of generations.keys()) if (key !== generation) generations.delete(key);
      return profile;
    }),
    failGeneration: vi.fn(async () => { profile = { ...profile, status: 'error' }; }),
    loadSnapshot: vi.fn(async () => generations.get(profile?.activeGeneration) || []),
    clearSnapshot: vi.fn(async () => { profile = null; generations.clear(); })
  };
};
const page = (ids, cursor = null) => ({ data: { page: { itemIds: ids, articles: ids.map(article), hasMore: Boolean(cursor), nextCursor: cursor } } });

describe('offline schema upgrades', () => {
  it('creates the account keys and publication index at version 1', () => {
    const index = vi.fn();
    const createObjectStore = vi.fn(() => ({ createIndex: index }));
    upgradeOfflineDatabase({ createObjectStore }, 0);
    expect(createObjectStore.mock.calls).toEqual([
      ['profiles', { keyPath: ['apiOrigin', 'userId'] }],
      ['articles', { keyPath: ['apiOrigin', 'userId', 'generation', 'articleId'] }]
    ]);
    expect(index).toHaveBeenCalledWith('publication', ['apiOrigin', 'userId', 'generation', 'publicationDate', 'articleId']);
  });
  it('preserves the current schema during subsequent upgrades', () => {
    const createObjectStore = vi.fn();
    upgradeOfflineDatabase({ createObjectStore }, 1);
    expect(createObjectStore).not.toHaveBeenCalled();
  });
});

describe('offline snapshots', () => {
  it.each([100, 250, 1000, 2500, 5000])('supports the %s limit and enforces it across cursor pages', async limit => {
    const db = createDatabase();
    const fetchPage = vi.fn(async (selection, { cursor }) => {
      const offset = Number(cursor || 0);
      return page(Array.from({ length: 100 }, (_, i) => 10000 - offset - i), String(offset + 100));
    });
    const service = createOfflineReadingService(db, fetchPage);
    await service.updateConfiguration(account, { articleLimit: limit });
    await service.prepareSnapshot(account);
    const snapshot = await service.loadSnapshot(account);
    expect(snapshot).toHaveLength(limit);
    expect(snapshot.map(item => item.id)).toEqual(Array.from({ length: limit }, (_, i) => 10000 - i));
    expect(snapshot.some(item => item.status === 'read')).toBe(true);
    expect(snapshot.some(item => item.status === 'unread')).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(Math.ceil(limit / 100));
    expect(fetchPage.mock.calls.every(([, pagination]) => pagination.pageSize === 100)).toBe(true);
    expect(fetchPage.mock.calls[0][0]).toEqual(latestOfflineSelection);
    expect(latestOfflineSelection).toMatchObject({ status: '%', grouping: 'none', persistSettings: false, search: '', sort: 'desc' });
  });
  it.each([0, 50, 500, 5001, '100', null])('rejects invalid limit %s', async articleLimit => {
    const db = createDatabase();
    await expect(createOfflineReadingService(db).updateConfiguration(account, { articleLimit })).rejects.toThrow('100, 250, 1000, 2500 or 5000');
    expect(db.updateProfile).not.toHaveBeenCalled();
  });
  it('keeps the previous snapshot available until every page completes', async () => {
    const db = createDatabase();
    let finish;
    const fetchPage = vi.fn().mockResolvedValueOnce(page([3, 2], 'next'))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const service = createOfflineReadingService(db, fetchPage);
    const progress = vi.fn();
    const job = service.prepareSnapshot(account, progress);
    await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(await service.loadSnapshot(account)).toEqual([article(1)]);
    expect(db.writeGeneration.mock.calls.every(call => !call[3])).toBe(true);
    finish(page([1]));
    await job;
    expect((await service.loadSnapshot(account)).map(item => item.id)).toEqual([3, 2, 1]);
    expect(progress).toHaveBeenLastCalledWith({ status: 'ready', prepared: 3, total: 100 });
  });
  it('preserves previous articles when a download is interrupted', async () => {
    const db = createDatabase();
    const fetchPage = vi.fn().mockResolvedValueOnce(page([3, 2], 'next')).mockRejectedValueOnce(new Error('Network failure'));
    const service = createOfflineReadingService(db, fetchPage);
    await expect(service.prepareSnapshot(account)).rejects.toThrow('Network failure');
    expect(await service.loadSnapshot(account)).toEqual([article(1)]);
    expect(await service.getStatus(account)).toMatchObject({ status: 'error', activeGeneration: 'old' });
  });
  it('coalesces simultaneous refreshes for the same account', async () => {
    const db = createDatabase();
    const fetchPage = vi.fn().mockResolvedValue(page([2]));
    const service = createOfflineReadingService(db, fetchPage);
    const first = service.refreshSnapshot(account);
    const second = service.refreshSnapshot(account);
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(fetchPage).toHaveBeenCalledOnce();
  });
  it('stops refreshing when disabled and retains existing downloads', async () => {
    const db = createDatabase();
    const fetchPage = vi.fn();
    const service = createOfflineReadingService(db, fetchPage);
    await service.updateConfiguration(account, { enabled: false });
    await service.refreshSnapshot(account);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(await service.loadSnapshot(account)).toEqual([article(1)]);
  });
  it('does not reactivate a snapshot cleared during a download', async () => {
    const db = createDatabase();
    let finish;
    const fetchPage = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const service = createOfflineReadingService(db, fetchPage);
    const job = service.refreshSnapshot(account);
    await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledOnce());
    await service.clearSnapshot(account);
    finish(page([2]));
    await job;
    expect(await service.getProfile(account)).toBeNull();
    expect(await service.loadSnapshot(account)).toEqual([]);
  });
});
