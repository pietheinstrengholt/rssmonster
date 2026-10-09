import assert from 'node:assert/strict';

// Reuse an installed Playwright and browser; this script never downloads dependencies.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || process.argv[2] || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.argv[3] ? { executablePath: process.argv[3] } : {}),
  ...(process.env.READING_BROWSER_EXECUTABLE ? { executablePath: process.env.READING_BROWSER_EXECUTABLE } : {})
});
try {
  const nativeContext = await browser.newContext();
  const page = await nativeContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:8080'}/tests/browser/offline.html`);
  await page.waitForFunction(() => Boolean(window.testOfflineDatabase));
  console.log(await page.evaluate(() => window.testOfflineDatabase()));
  assert.deepEqual(errors, []);
  const secondTab = await page.context().newPage();
  await secondTab.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:8080'}/tests/browser/offline.html`);
  await secondTab.waitForFunction(() => Boolean(window.testOfflineDatabase));
  const account = { apiOrigin: 'https://tabs.example', userId: 97 };
  await secondTab.evaluate(async () => {
    const { OFFLINE_STATE_EVENT } = await import('/src/services/offlineCoordination.js');
    window.addEventListener(OFFLINE_STATE_EVENT, event => { window.remoteOfflineChange = event.detail; });
  });
  await page.evaluate(async account => {
    const { offlineDatabase } = await import('/src/services/offlineDatabase.js');
    const { publishOfflineChange } = await import('/src/services/offlineCoordination.js');
    await offlineDatabase.enqueueActions(account, [{ actionId: crypto.randomUUID(), articleId: 42, kind: 'set-status', value: 'read' }], 0);
    publishOfflineChange(account, undefined, { local: true });
  }, account);
  await secondTab.waitForFunction(() => window.remoteOfflineChange?.remote === true);
  const leases = await Promise.all([page, secondTab].map((tab, index) => tab.evaluate(async ({ account, owner }) => {
    const { offlineDatabase } = await import('/src/services/offlineDatabase.js');
    return offlineDatabase.acquireLease(account, owner);
  }, { account, owner: `tab-${index}` })));
  assert.equal(leases.filter(Boolean).length, 1, 'concurrent tabs share one lease');
  assert.equal(await secondTab.evaluate(async account => {
    const { offlineDatabase } = await import('/src/services/offlineDatabase.js');
    const actions = await offlineDatabase.getActions(account);
    await offlineDatabase.invalidateSession(account);
    return actions.length;
  }, account), 1, 'second tab observes the same durable queue');
  assert.equal(await page.evaluate(async ({ account, lease }) => {
    const { offlineDatabase } = await import('/src/services/offlineDatabase.js');
    return offlineDatabase.acknowledgeActions(account, lease, [], { results: [], articles: [] });
  }, { account, lease: leases.find(Boolean) }), false, 'remote invalidation fences suspended owners');
  await page.evaluate(async account => { const { offlineDatabase } = await import('/src/services/offlineDatabase.js'); await offlineDatabase.discardActions(account); }, account);
  await secondTab.close();
  console.log('PASS: live two-tab lease contention, shared queue, BroadcastChannel notification and session fencing');
  const pwaBaseUrl = process.env.OFFLINE_PWA_BASE_URL || process.argv[4];
  if (pwaBaseUrl) {
    const appPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const context = appPage.context();
    const appErrors = [];
    appPage.on('pageerror', error => appErrors.push(error.message));
    const dto = { id: 41, title: 'Offline browser article', publishedAt: '2026-10-01T12:00:00Z',
      content: '<p>Full article body available after an offline cold reload.</p>', contentText: 'Full article body available after an offline cold reload.',
      status: 'unread', favoriteInd: 1, feedId: 2, feed: { id: 2, categoryId: 1, name: 'Browser feed' }, tags: [] };
    const receipts = new Map();
    let invalid = false;
    let offline = false;
    let snapshotRefreshes = 0;
    const articleQueries = [];
    await context.addCookies([{ name: 'token', value: 'browser-validated-token', url: pwaBaseUrl }]);
    await context.route('**/api/**', async route => {
      if (offline) { await route.abort('internetdisconnected'); return; }
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/validate') {
        await route.fulfill({ status: invalid ? 401 : 200, headers: { 'cache-control': 'no-store' }, json: invalid ? { message: 'expired' } : { user: { id: 1, role: 'user' } } });
        return;
      }
      let data = {};
      if (url.pathname === '/api/articles/sync-actions') {
        const actions = route.request().postDataJSON().actions;
        const results = actions.map(action => {
          if (receipts.has(action.actionId)) return { actionId: action.actionId, outcome: 'duplicate' };
          if (action.kind === 'set-status') dto.status = action.value;
          else dto.favoriteInd = Number(action.value);
          receipts.set(action.actionId, action);
          return { actionId: action.actionId, outcome: 'applied' };
        });
        data = { results, articles: [dto], serverTime: new Date().toISOString() };
      }
      if (url.pathname === '/api/auth/configuration') data = { localAuthEnabled: true };
      if (url.pathname === '/api/setting') data = { status: '%', viewMode: 'full', sort: 'desc', grouping: 'none', markAsReadOnScroll: false, onboardingCompleted: true };
      if (url.pathname.startsWith('/api/manager/overview')) data = { categories: [{ id: 1, name: 'News', feeds: [{ id: 2, name: 'Browser feed' }] }], unreadCount: 1 };
      if (url.pathname === '/api/smartfolders' || url.pathname === '/api/tags/top') data = [];
      if (url.pathname === '/api/articles') {
        articleQueries.push(url.search);
        if (url.searchParams.get('persistSettings') === 'false' && url.searchParams.get('status') === '%') snapshotRefreshes++;
        data = { paginationVersion: 1, totalCount: 1, sourceCount: 1, snapshot: { snapshotMaxArticleId: 41 },
          page: { itemIds: [41], articles: [dto], hasMore: false, nextCursor: null } };
      }
      await route.fulfill({ headers: { 'cache-control': 'no-store' }, json: data });
    });
    await appPage.goto(pwaBaseUrl);
    await appPage.getByText(dto.title, { exact: true }).first().waitFor();
    await appPage.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('rssmonster-offline-identity:')));
    await appPage.evaluate(() => navigator.serviceWorker.ready);
    await appPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await appPage.getByRole('button', { name: 'Open settings', exact: true }).click();
    await appPage.getByLabel('Settings navigation').getByRole('button', { name: 'Offline reading', exact: true }).click();
    await appPage.getByRole('switch', { name: 'Enable offline reading' }).check();
    await appPage.getByText('1 of 100 articles available offline', { exact: true }).waitFor();
    await appPage.getByRole('button', { name: 'Close settings', exact: true }).click();
    const initialGeneration = await appPage.evaluate(async () => {
      const database = await new Promise(resolve => {
        const request = indexedDB.open('rssmonster-offline', 2);
        request.onsuccess = () => resolve(request.result);
      });
      const identity = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('rssmonster-offline-identity:'))));
      const profile = await new Promise(resolve => {
        const request = database.transaction('profiles').objectStore('profiles').get([identity.apiOrigin, 1]);
        request.onsuccess = () => resolve(request.result);
      });
      database.close();
      return profile.activeGeneration;
    });
    assert.equal(typeof initialGeneration, 'string');
    snapshotRefreshes = 0;
    offline = true;
    await context.setOffline(true);
    await appPage.reload();
    await appPage.getByText(/Downloaded articles · Offline reading/).waitFor();
    await appPage.getByText('Full article body available after an offline cold reload.', { exact: true }).waitFor();
    const useMenu = async name => {
      await appPage.getByRole('button', { name: 'Article actions', exact: true }).first().click();
      await appPage.getByRole('menuitem', { name, exact: true }).click();
      await appPage.keyboard.press('Escape');
    };
    await useMenu('Mark as read');
    await useMenu('Remove from saved');
    const queuedCount = async () => appPage.evaluate(async () => {
      const db = await new Promise(resolve => { const request = indexedDB.open('rssmonster-offline', 2); request.onsuccess = () => resolve(request.result); });
      const actions = await new Promise(resolve => { const request = db.transaction('pendingActions').objectStore('pendingActions').getAll(); request.onsuccess = () => resolve(request.result); });
      db.close(); return actions.length;
    });
    assert.equal(await queuedCount(), 2, 'offline controls commit durable intent');
    await appPage.reload();
    await appPage.getByText(/Downloaded articles · Offline reading/).waitFor();
    await appPage.getByRole('button', { name: 'Article actions', exact: true }).first().click();
    await appPage.getByRole('menuitem', { name: 'Mark as unread', exact: true }).waitFor();
    await appPage.getByRole('menuitem', { name: 'Save article', exact: true }).waitFor();
    await appPage.keyboard.press('Escape');
    await appPage.setViewportSize({ width: 390, height: 844 });
    await appPage.getByText('Full article body available after an offline cold reload.', { exact: true }).waitFor();
    await appPage.setViewportSize({ width: 1100, height: 800 });
    offline = false;
    await context.setOffline(false);
    await appPage.getByText(/Downloaded articles · Offline reading/).waitFor({ state: 'hidden' });
    await appPage.evaluate(initialGeneration => {
      window.offlineRecoveryReady = false;
      const check = async () => {
        const database = await new Promise(resolve => {
          const request = indexedDB.open('rssmonster-offline', 2);
          request.onsuccess = () => resolve(request.result);
        });
        const identity = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('rssmonster-offline-identity:'))));
        const profile = await new Promise(resolve => {
          const request = database.transaction('profiles').objectStore('profiles').get([identity.apiOrigin, 1]);
          request.onsuccess = () => resolve(request.result);
        });
        database.close();
        window.offlineRecoveryReady = profile?.activeGeneration !== initialGeneration && profile?.status === 'ready';
        if (!window.offlineRecoveryReady) requestAnimationFrame(check);
      };
      void check();
    }, initialGeneration);
    await appPage.waitForFunction(() => window.offlineRecoveryReady);
    assert.equal(await queuedCount(), 0, 'recovery durably acknowledges pending changes');
    assert.equal(dto.status, 'read'); assert.equal(dto.favoriteInd, 0);
    assert.equal(receipts.size, 2, 'server effects occur once');
    assert.equal(snapshotRefreshes, 1, `recovery refreshes exactly once: ${JSON.stringify(articleQueries)}`);
    await appPage.getByRole('button', { name: 'Open settings', exact: true }).click();
    await appPage.getByLabel('Settings navigation').getByRole('button', { name: 'Offline reading', exact: true }).click();
    await appPage.getByText('Pending changes', { exact: true }).waitFor();
    await appPage.getByRole('button', { name: 'Discard unsynchronized changes', exact: true }).waitFor();
    const screenshotDirectory = process.env.OFFLINE_SCREENSHOT_DIR || process.argv[5];
    if (screenshotDirectory) await appPage.screenshot({ path: `${screenshotDirectory}/settings-light.png`, fullPage: true });
    await appPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    if (screenshotDirectory) await appPage.screenshot({ path: `${screenshotDirectory}/settings-dark.png`, fullPage: true });
    await appPage.setViewportSize({ width: 390, height: 844 });
    await appPage.getByText('Pending changes', { exact: true }).scrollIntoViewIfNeeded();
    if (screenshotDirectory) await appPage.screenshot({ path: `${screenshotDirectory}/settings-mobile.png`, fullPage: true });
    await appPage.getByRole('button', { name: 'Close settings', exact: true }).click();
    await appPage.setViewportSize({ width: 1100, height: 800 });
    offline = true;
    await context.setOffline(true);
    await appPage.getByText(/Downloaded articles · Offline reading/).waitFor();
    await useMenu('Mark as unread');
    assert.equal(await queuedCount(), 1, 'intent is durable before expiry');
    invalid = true;
    offline = false;
    await context.setOffline(false);
    await appPage.getByText('Sign in to RSSMonster', { exact: true }).waitFor();
    assert.equal((await context.cookies()).some(cookie => cookie.name === 'token'), false, 'invalid recovery logs out');
    assert.equal(await queuedCount(), 1, 'session expiry preserves pending intent');
    invalid = false;
    await context.addCookies([{ name: 'token', value: 'browser-reauthenticated-token', url: pwaBaseUrl }]);
    await appPage.reload();
    await appPage.getByText(dto.title, { exact: true }).first().waitFor();
    const synchronizationDeadline = Date.now() + 30000;
    while (await queuedCount()) {
      assert.ok(Date.now() < synchronizationDeadline, 'reauthentication acknowledges the retained queue');
      await appPage.waitForTimeout(100);
    }
    assert.equal(dto.status, 'unread', 'same-account reauthentication resumes saved intent');
    assert.equal(receipts.size, 3, 'reauthentication applies the new UUID once');
    assert.deepEqual(appErrors, []);
    console.log('PASS: service-worker-controlled offline cold startup, desktop/mobile article body rendering, durable offline controls across reload, receipt-backed authenticated recovery, one snapshot refresh, synchronization settings, invalid-session pause and same-account resumption');
    await appPage.close();
  }
} finally {
  await browser.close();
}
