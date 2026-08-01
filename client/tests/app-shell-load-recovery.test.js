import Cookies from 'js-cookie';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import * as authApi from '../src/api/auth';
import { loadAppShell } from '../src/services/appShellLoader.js';

vi.mock('../src/api/auth', () => ({
  applyAuthToken: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  validateSession: vi.fn()
}));

vi.mock('../src/services/appShellLoader.js', () => ({
  loadAppShell: vi.fn()
}));

// This function creates a shell request whose failure can be synchronized with component rendering.
const deferred = () => {
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
  });

  return { promise, reject };
};

describe('AppShell load recovery', () => {
  it('handles a failed shared request and retries the authenticated boundary', async () => {
    const shell = deferred();
    const shellError = new Error('chunk unavailable');
    vi.spyOn(Cookies, 'get').mockReturnValue('saved-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authApi.validateSession.mockResolvedValueOnce({ user: { role: 'user' } });
    loadAppShell
      .mockReturnValueOnce(shell.promise)
      .mockReturnValueOnce(shell.promise)
      .mockResolvedValue({
        name: 'RecoveredAppShellTestStub',
        template: '<div data-test="app-shell">Recovered reader</div>'
      });

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()]
      }
    });
    await flushPromises();

    shell.reject(shellError);
    await flushPromises();

    expect(wrapper.get('[data-test="app-shell"]').text()).toBe('Recovered reader');
    expect(console.error).toHaveBeenCalledWith('App shell preload error:', shellError);
    expect(console.error).toHaveBeenCalledWith('App shell load error:', shellError);
  });
});
