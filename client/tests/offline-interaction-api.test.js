import { afterEach, describe, expect, it, vi } from 'vitest';
import { articleStateActions } from '../src/services/articleStateActions.js';
import { offlineDatabase } from '../src/services/offlineDatabase.js';
import { markArticleSeen, markArticleUnread, markAsFavorite, markArticlesAsRead } from '../src/api/articles.js';
import api from '../src/api/client.js';
vi.mock('../src/api/client.js', () => ({ default: { post: vi.fn() }, API_BASE_URL: 'https://reader.example/api' }));
const article = { id: 42, status: 'unread', favoriteInd: 0, feedId: 2, feed: { categoryId: 1 } };
afterEach(() => { articleStateActions.clearSession(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const offline = () => {
  vi.stubGlobal('indexedDB', {});
  articleStateActions.setSession({ apiOrigin: 'https://reader.example/api', userId: 1 }, 0, () => true);
  return vi.spyOn(offlineDatabase, 'enqueueActions').mockResolvedValue([]);
};
describe('offline interaction API integration', () => {
  it('persists read/unread and favorite/unfavorite with metadata before returning visible state', async () => {
    const enqueue = offline();
    expect((await markArticleSeen(42, { markRead: true, recordObservation: true, visibleSeconds: 200, grouping: 'event' }, article)).data.status).toBe('read');
    expect((await markArticleUnread(42, article)).data.status).toBe('unread');
    expect((await markAsFavorite(42, 'mark', article)).data.favoriteInd).toBe(1);
    expect((await markAsFavorite(42, 'unmark', article)).data.favoriteInd).toBe(0);
    expect(api.post).not.toHaveBeenCalled();
    expect(enqueue.mock.calls.map(call => call[1][0])).toEqual([
      expect.objectContaining({ kind: 'set-status', value: 'read' }), expect.objectContaining({ kind: 'set-status', value: 'unread' }),
      expect.objectContaining({ kind: 'set-favorite', value: true }), expect.objectContaining({ kind: 'set-favorite', value: false })
    ]);
    expect(enqueue.mock.calls[0][1][0]).not.toHaveProperty('visibleSeconds');
  });
  it('queues only explicit bulk IDs even for Event grouping', async () => {
    const enqueue = offline();
    const response = await markArticlesAsRead([42], 'event', [article]);
    expect(response.data.articles).toEqual([{ ...article, status: 'read' }]);
    expect(enqueue.mock.calls[0][1]).toHaveLength(1); expect(api.post).not.toHaveBeenCalled();
  });
});


it('preserves the existing online endpoint for a duplicate row while reconciling cached state', async () => {
  vi.stubGlobal('indexedDB', {});
  articleStateActions.setSession({ apiOrigin: 'https://reader.example/api', userId: 1 }, 0);
  const enqueue = vi.spyOn(offlineDatabase, 'enqueueActions');
  vi.spyOn(offlineDatabase, 'acquireLease').mockResolvedValue({ owner: 'test', epoch: 0 });
  vi.spyOn(offlineDatabase, 'releaseLease').mockResolvedValue();
  const patch = vi.spyOn(offlineDatabase, 'reconcileArticles').mockResolvedValue(true);
  api.post.mockResolvedValue({ data: { ...article, duplicateOfArticleId: 10, favoriteInd: 1 } });
  await markAsFavorite(42, 'mark', { ...article, duplicateOfArticleId: 10 });
  expect(api.post).toHaveBeenCalledWith('/articles/markasfavorite/42', { update: 'mark' });
  expect(enqueue).not.toHaveBeenCalled(); expect(patch).toHaveBeenCalledOnce();
});

it('retains explicit read intent when connectivity fails before offline mode activates', async () => {
  vi.stubGlobal('indexedDB', {});
  articleStateActions.setSession({ apiOrigin: 'https://reader.example/api', userId: 1 }, 0);
  vi.spyOn(offlineDatabase, 'acquireLease').mockResolvedValue({ owner: 'test', epoch: 0 });
  vi.spyOn(offlineDatabase, 'releaseLease').mockResolvedValue();
  const enqueue = vi.spyOn(offlineDatabase, 'enqueueActions').mockResolvedValue([]);
  api.post.mockRejectedValue(Object.assign(new Error('Timeout after possible commit'), { code: 'ECONNABORTED' }));
  expect((await markArticleSeen(42, { markRead: true, recordObservation: true, visibleSeconds: 40, grouping: 'event' }, article)).data.status).toBe('read');
  expect((await markArticlesAsRead([42], 'event', [article])).data.articles[0].status).toBe('read');
  expect(enqueue.mock.calls.map(call => call[1])).toEqual([
    [expect.objectContaining({ articleId: 42, kind: 'set-status', value: 'read' })],
    [expect.objectContaining({ articleId: 42, kind: 'set-status', value: 'read' })]
  ]);
  expect(enqueue.mock.calls[0][1][0]).not.toHaveProperty('visibleSeconds');
});

it('never transfers a failed online read to a newly authenticated account', async () => {
  vi.stubGlobal('indexedDB', {});
  articleStateActions.setSession({ apiOrigin: 'https://reader.example/api', userId: 1 }, 0);
  vi.spyOn(offlineDatabase, 'acquireLease').mockResolvedValue({ owner: 'test', epoch: 0 });
  vi.spyOn(offlineDatabase, 'releaseLease').mockResolvedValue();
  const enqueue = vi.spyOn(offlineDatabase, 'enqueueActions');
  api.post.mockImplementation(async () => {
    articleStateActions.setSession({ apiOrigin: 'https://reader.example/api', userId: 2 }, 0);
    throw Object.assign(new Error('Network failure'), { code: 'ERR_NETWORK' });
  });
  await expect(markArticleSeen(42, { markRead: true, recordObservation: true }, article)).rejects.toThrow('account changed');
  expect(enqueue).not.toHaveBeenCalled();
});

it('does not queue an attention-only failure or an authorization rejection', async () => {
  vi.stubGlobal('indexedDB', {});
  articleStateActions.setSession({ apiOrigin: 'https://reader.example/api', userId: 1 }, 0);
  vi.spyOn(offlineDatabase, 'acquireLease').mockResolvedValue({ owner: 'test', epoch: 0 });
  vi.spyOn(offlineDatabase, 'releaseLease').mockResolvedValue();
  const enqueue = vi.spyOn(offlineDatabase, 'enqueueActions');
  api.post.mockRejectedValue(Object.assign(new Error('Disconnected'), { code: 'ERR_NETWORK' }));
  await expect(markArticleSeen(42, { markRead: false, recordObservation: true }, article)).rejects.toThrow('Disconnected');
  api.post.mockRejectedValue(Object.assign(new Error('Unauthorized'), { response: { status: 401 } }));
  await expect(markArticleSeen(42, { markRead: true, recordObservation: true }, article)).rejects.toThrow('Unauthorized');
  expect(enqueue).not.toHaveBeenCalled();
});
