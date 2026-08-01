import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_ERROR_EVENT,
  isFatalActionError,
  notifyActionError
} from '../src/services/actionNotifications.js';

afterEach(() => {
  vi.doUnmock('../src/AppShell.vue');
  vi.doUnmock('../src/services/authenticatedShell.js');
  vi.doUnmock('../src/services/bootstrapIcons.js');
  vi.doUnmock('bootstrap/js/dist/dropdown.js');
  vi.doUnmock('virtual:bootstrap-icons-sprite');
  vi.resetModules();
});

describe('action notification service', () => {
  it('treats a missing error as recoverable', () => {
    expect(isFatalActionError()).toBe(false);
  });

  it('uses the default message when no action-specific message is provided', () => {
    const listener = vi.fn();
    window.addEventListener(ACTION_ERROR_EVENT, listener, { once: true });

    expect(notifyActionError()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail).toEqual({
      message: 'Could not complete that action. Please try again.'
    });
  });
});

describe('application shell loader', () => {
  it('reuses one request and resolves the AppShell default export', async () => {
    const appShell = { name: 'AppShellTestStub' };
    vi.doMock('../src/AppShell.vue', () => ({ default: appShell }));
    vi.doMock('../src/services/authenticatedShell.js', () => ({}));
    const { loadAppShell } = await import('../src/services/appShellLoader.js');

    const firstRequest = loadAppShell();
    const repeatedRequest = loadAppShell();

    expect(repeatedRequest).toBe(firstRequest);
    await expect(firstRequest).resolves.toBe(appShell);
  });

  it('clears a failed request so the shell can be requested again', async () => {
    vi.doMock('../src/AppShell.vue', () => {
      throw new Error('chunk unavailable');
    });
    vi.doMock('../src/services/authenticatedShell.js', () => ({}));
    const { loadAppShell } = await import('../src/services/appShellLoader.js');

    const failedRequest = loadAppShell();
    await expect(failedRequest).rejects.toThrow();

    const retryRequest = loadAppShell();
    expect(retryRequest).not.toBe(failedRequest);
    await expect(retryRequest).rejects.toThrow();
  });
});

describe('authenticated shell runtime', () => {
  it('injects the generated icon sprite when the boundary loads', async () => {
    const injectBootstrapIcons = vi.fn();
    vi.doMock('bootstrap/js/dist/dropdown.js', () => ({}));
    vi.doMock('../src/services/bootstrapIcons.js', () => ({ injectBootstrapIcons }));

    await import('../src/services/authenticatedShell.js');

    expect(injectBootstrapIcons).toHaveBeenCalledOnce();
    expect(injectBootstrapIcons)
      .toHaveBeenCalledWith('<svg data-test="authenticated-icons"></svg>');
  });
});
