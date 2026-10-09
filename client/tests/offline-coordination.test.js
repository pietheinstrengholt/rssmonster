import { reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('cross-tab offline notifications', () => {
  it('broadcasts cloneable plain data from reactive account and article DTOs', async () => {
    const post = vi.fn(message => structuredClone(message));
    vi.stubGlobal('BroadcastChannel', class { postMessage = post; });
    vi.resetModules();
    const { publishOfflineChange, OFFLINE_STATE_EVENT } = await import('../src/services/offlineCoordination.js');
    const local = vi.fn(); window.addEventListener(OFFLINE_STATE_EVENT, local);
    expect(() => publishOfflineChange(reactive({ apiOrigin: 'https://reader.example', userId: 1 }), undefined,
      { local: true, articles: [reactive({ id: 42, feed: { id: 2 }, status: 'read' })] })).not.toThrow();
    expect(post).toHaveBeenCalledOnce(); expect(local).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0].articles[0]).toMatchObject({ id: 42, status: 'read' });
    window.removeEventListener(OFFLINE_STATE_EVENT, local);
  });
});
