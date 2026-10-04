import { webcrypto } from 'node:crypto';
import Cookies from 'js-cookie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import AppShell from '../src/AppShell.vue';
import * as authApi from '../src/api/auth.js';
import api, { setOfflineReadOnly } from '../src/api/client.js';
import { useAuthStore } from '../src/store/auth.js';
import { useOfflineReadingStore } from '../src/store/offlineReading.js';
import { offlineReading, offlineAccount } from '../src/services/offlineReading.js';
import { rememberOfflineIdentity, loadOfflineIdentity } from '../src/services/offlineIdentity.js';

vi.mock('../src/services/appShellLoader.js', () => ({ loadAppShell: vi.fn().mockResolvedValue({ template: '<div />' }) }));
const profile = { enabled: true, activeGeneration: 'ready', preparedArticleCount: 1, articleLimit: 100 };
const context = () => {
  const ctx = { authStore: useAuthStore(), isAuthenticated: false, message: '' };
  ctx.logout = vi.fn(options => App.methods.logout.call(ctx, options));
  return ctx;
};
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  localStorage.clear();
  Cookies.set('token', 'validated-token');
  vi.spyOn(offlineReading, 'getProfile').mockResolvedValue(profile);
  vi.spyOn(offlineReading, 'clearSnapshot').mockResolvedValue();
  vi.spyOn(offlineReading, 'refreshSnapshot').mockResolvedValue(profile);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  setOfflineReadOnly(false);
  Cookies.remove('token');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const remember = () => rememberOfflineIdentity({ token: 'validated-token', userId: 1, role: 'user' });

describe('offline authentication', () => {
  it.each([new Error('Network unavailable'), { response: { status: 503 } }, { response: { status: 429 } }, { response: { status: 200 }, code: 'ERR_BAD_RESPONSE' }])('preserves a validated identity and ready snapshot when validation is unreachable', async error => {
    await remember();
    vi.spyOn(authApi, 'validateSession').mockRejectedValue(error);
    const ctx = context();
    await App.methods.checkSession.call(ctx);
    expect(ctx.logout).not.toHaveBeenCalled();
    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.authStore.userId).toBe(1);
    expect(Cookies.get('token')).toBe('validated-token');
    expect(useOfflineReadingStore().readOnly).toBe(true);
    expect(useOfflineReadingStore().account).toEqual(offlineAccount(1));
  });
  it.each([401, 403])('logs out on explicit invalid authentication (%s)', async status => {
    await remember();
    vi.spyOn(authApi, 'validateSession').mockRejectedValue({ response: { status } });
    const ctx = context();
    await App.methods.checkSession.call(ctx);
    expect(ctx.logout).toHaveBeenCalledOnce();
    expect(Cookies.get('token')).toBeUndefined();
    await vi.waitFor(() => expect(offlineReading.clearSnapshot).toHaveBeenCalledWith(offlineAccount(1)));
    expect(await loadOfflineIdentity('validated-token')).toBeNull();
  });
  it('rejects a saved identity when the cookie belongs to a different session', async () => {
    await remember();
    Cookies.set('token', 'other-account-token');
    vi.spyOn(authApi, 'validateSession').mockRejectedValue(new Error('Network unavailable'));
    const ctx = context();
    await App.methods.checkSession.call(ctx);
    expect(ctx.isAuthenticated).toBe(false);
    expect(ctx.authStore.userId).toBeNull();
    expect(offlineReading.getProfile).not.toHaveBeenCalled();
  });
  it('cannot use a different account snapshot', async () => {
    await remember();
    vi.spyOn(authApi, 'validateSession').mockRejectedValue(new Error('Network unavailable'));
    offlineReading.getProfile.mockImplementation(async account => account.userId === 2 ? profile : null);
    const ctx = context();
    await App.methods.checkSession.call(ctx);
    expect(ctx.isAuthenticated).toBe(false);
    expect(Cookies.get('token')).toBe('validated-token');
    expect(ctx.logout).not.toHaveBeenCalled();
  });
  it('logout clears the active account without clearing an older identity marker account', async () => {
    await remember();
    Cookies.set('token', 'other-account-token');
    const ctx = context();
    ctx.authStore.setSession({ token: 'other-account-token', userId: 2, role: 'user', offline: true });
    await useOfflineReadingStore().initialize(2, true);
    App.methods.logout.call(ctx);
    expect(offlineReading.clearSnapshot).toHaveBeenCalledWith(offlineAccount(2));
    expect(offlineReading.clearSnapshot).not.toHaveBeenCalledWith(offlineAccount(1));
  });
  it('blocks offline mutations before they reach the network', async () => {
    const adapter = vi.fn();
    setOfflineReadOnly(true);
    await expect(api.post('/articles/markasfavorite/1', { update: 'mark' }, { adapter })).rejects.toMatchObject({ code: 'ERR_OFFLINE' });
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe('offline lifecycle', () => {
  it('validates recovery and coalesces it into one refresh', async () => {
    const authStore = useAuthStore();
    authStore.setSession({ token: 'validated-token', userId: 1, role: 'user', offline: true });
    const offlineReadingStore = useOfflineReadingStore();
    await offlineReadingStore.initialize(1, true);
    const validate = vi.spyOn(authApi, 'validateSession').mockResolvedValue({ user: { id: 1, role: 'user' } });
    const refreshArticles = vi.fn().mockResolvedValue(true);
    const ctx = {
      selectionStore: { currentSelection: { status: 'unread' } },
      authStore, offlineReadingStore, connectivityRecoveryPromise: null, isUnmounting: false,
      overviewStore: { fetchOverviewSplit: vi.fn().mockResolvedValue() },
      $nextTick: vi.fn().mockResolvedValue(), $refs: { articleFeed: { refreshArticleIds: refreshArticles } },
      startOverviewPolling: vi.fn(), handleOverviewFailure: vi.fn(), handleConnectivityError: vi.fn()
    };
    const first = AppShell.methods.recoverConnectivity.call(ctx);
    const second = AppShell.methods.recoverConnectivity.call(ctx);
    expect(first).toBe(second);
    const result = await first;
    expect(result).toBe(true);
    expect(validate).toHaveBeenCalledOnce();
    expect(refreshArticles).toHaveBeenCalledOnce();
    expect(offlineReading.refreshSnapshot).toHaveBeenCalledOnce();
    expect(offlineReadingStore.readOnly).toBe(false);
  });
  it('keeps downloaded articles accessible when recovery still cannot reach the backend', async () => {
    const authStore = useAuthStore();
    authStore.setSession({ token: 'validated-token', userId: 1, role: 'user', offline: true });
    const offlineReadingStore = useOfflineReadingStore();
    await offlineReadingStore.initialize(1, true);
    vi.spyOn(authApi, 'validateSession').mockRejectedValue({ response: { status: 503 } });
    const ctx = { authStore, offlineReadingStore, connectivityRecoveryPromise: null, isUnmounting: false,
      overviewLoaded: true, overviewStore: { fetchOverviewSplit: vi.fn() }, handleOverviewFailure: vi.fn() };
    expect(await AppShell.methods.recoverConnectivity.call(ctx)).toBe(false);
    expect(offlineReadingStore.readOnly).toBe(true);
    expect(ctx.overviewLoaded).toBe(true);
    expect(ctx.connectivityStatus).toBe('backend-unreachable');
    expect(ctx.handleOverviewFailure).not.toHaveBeenCalled();
  });
  it('invalid recovery expires the session without refreshing', async () => {
    const authStore = useAuthStore();
    authStore.setSession({ token: 'validated-token', userId: 1, role: 'user', offline: true });
    const offlineReadingStore = useOfflineReadingStore();
    await offlineReadingStore.initialize(1, true);
    vi.spyOn(authApi, 'validateSession').mockRejectedValue({ response: { status: 401 } });
    const expired = vi.fn();
    window.addEventListener('auth:expired', expired);
    const ctx = { authStore, offlineReadingStore, connectivityRecoveryPromise: null, isUnmounting: false,
      overviewStore: { fetchOverviewSplit: vi.fn() }, handleOverviewFailure: vi.fn() };
    expect(await AppShell.methods.recoverConnectivity.call(ctx)).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
    expect(offlineReading.refreshSnapshot).not.toHaveBeenCalled();
    window.removeEventListener('auth:expired', expired);
  });
});
