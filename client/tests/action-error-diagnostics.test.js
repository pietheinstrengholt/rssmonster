import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionErrorNotice from '../src/components/shared/ActionErrorNotice.vue';
import AppShell from '../src/AppShell.vue';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';
import { articleStateActions } from '../src/services/articleStateActions.js';
import { ACTION_ERROR_EVENT, notifyActionError } from '../src/services/actionNotifications.js';
import { createActionErrorDiagnostics } from '../src/services/actionErrorDiagnostics.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('shareable action error diagnostics', () => {
  // Article reconciliation adds counts and layout context without copying article or account data.
  it('captures the original reconciliation failure and its reading context', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(articleStateActions, 'overlay').mockRejectedValue(new DOMException('Storage interrupted', 'UnknownError'));
    const listener = vi.fn();
    window.addEventListener(ACTION_ERROR_EVENT, listener, { once: true });
    const account = { apiOrigin: 'https://reader.example', userId: 1 };
    await ArticleFeed.methods.reconcileOfflineState.call({
      ...ArticleFeed.methods, pendingOfflineChanges: [], reconcilingOfflineChanges: false,
      articles: [{ id: 41, title: 'Private article title' }], activeRequestId: 1,
      offlineReadingStore: { account, sessionId: 1, readOnly: false },
      selectionStore: { currentSelection: { viewMode: 'full' } }
    }, { detail: { account, articles: [{ id: 41, status: 'read' }] } });
    const report = listener.mock.calls[0][0].detail.diagnostics;
    expect(JSON.parse(report).context).toMatchObject({ operation: 'reconcile-local-article-changes', articleCount: 1, receivedArticleCount: 1, viewMode: 'full', requestChanged: false });
    expect(JSON.parse(report).error).toMatchObject({ name: 'UnknownError', message: 'Storage interrupted' });
    expect(report).not.toContain('Private article title');
    expect(report).not.toContain('userId');
  });
  // The report preserves the failure while excluding transport payloads and credentials.
  it('captures browser and storage errors without request bodies, URL parameters or credentials', () => {
    const error = Object.assign(new Error('Storage failed at https://reader.example/api?token=private#secret Bearer private-auth password=private-password'), {
      code: 8, response: { status: 503, data: { secret: 'private-response' } },
      config: { headers: { Authorization: 'private-header' }, data: 'private-body' }
    });
    const report = createActionErrorDiagnostics('Could not reconcile local article changes.', error, { operation: 'reconcile-local-article-changes' });
    const parsed = JSON.parse(report);
    expect(parsed.error).toMatchObject({ name: 'Error', code: 8, httpStatus: 503 });
    expect(parsed.error.stack).toContain('Storage failed');
    expect(parsed.browser).toMatchObject({ online: true, viewport: { width: 1024, height: 768 } });
    expect(parsed.context.operation).toBe('reconcile-local-article-changes');
    expect(Number.isNaN(Date.parse(parsed.capturedAt))).toBe(false);
    for (const secret of ['private', '#secret']) expect(report).not.toContain(secret);
  });

  // Notifications and console logs carry the identical snapshot of the failure.
  it('passes the captured report through the shell and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    window.addEventListener(ACTION_ERROR_EVENT, listener, { once: true });
    notifyActionError('Reconciliation failed', new DOMException('Storage interrupted', 'UnknownError'));
    const detail = listener.mock.calls[0][0].detail;
    const context = { showActionError: vi.fn() };
    AppShell.methods.handleActionError.call(context, { detail });
    expect(JSON.parse(context.actionErrorDiagnostics).error).toMatchObject({ name: 'UnknownError', message: 'Storage interrupted' });
    expect(log).toHaveBeenCalledWith('Action failed:', detail.diagnostics);
  });

  // Mobile readers can open, copy and close details without dismissing the original error.
  it('opens the report from the error message and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { userAgent: 'Test browser', onLine: true, clipboard: { writeText } });
    const wrapper = mount(ActionErrorNotice, { attachTo: document.body, props: { message: 'Reconciliation failed', diagnostics: 'Storage report' } });
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click');
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Error details');
    expect(document.querySelector('textarea').value).toBe('Storage report');
    await wrapper.setProps({ diagnostics: 'A later background error' });
    expect(document.querySelector('textarea').value).toBe('Storage report');
    const copy = [...document.querySelectorAll('button')].find(button => button.textContent === 'Copy details');
    copy.click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('Storage report');
    expect(document.querySelector('[role="status"]').textContent).toBe('Details copied.');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(wrapper.emitted('dismiss')).toBeUndefined();
    wrapper.unmount();
  });

  // When clipboard permissions fail, the same selectable report remains available.
  it('offers manual copying when clipboard access is unavailable', async () => {
    const wrapper = mount(ActionErrorNotice, { attachTo: document.body, props: { message: 'Reconciliation failed', diagnostics: 'Storage report' } });
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click');
    [...document.querySelectorAll('button')].find(button => button.textContent === 'Copy details').click();
    await flushPromises();
    expect(document.querySelector('[role="status"]').textContent).toContain('copy it manually');
    expect(document.querySelector('textarea').readOnly).toBe(true);
    wrapper.unmount();
  });
});
