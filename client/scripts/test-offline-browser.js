import assert from 'node:assert/strict';

// Reuse an installed Playwright and browser; this script never downloads dependencies.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || process.argv[2] || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.argv[3] ? { executablePath: process.argv[3] } : {}),
  ...(process.env.READING_BROWSER_EXECUTABLE ? { executablePath: process.env.READING_BROWSER_EXECUTABLE } : {})
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:5173'}/tests/browser/offline.html`);
  await page.waitForFunction(() => Boolean(window.testOfflineDatabase));
  console.log(await page.evaluate(() => window.testOfflineDatabase()));
  assert.deepEqual(errors, []);
  const pwaBaseUrl = process.env.OFFLINE_PWA_BASE_URL || process.argv[4];
  if (pwaBaseUrl) {
    const appPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const context = appPage.context();
    const appErrors = [];
    appPage.on('pageerror', error => appErrors.push(error.message));
    const dto = { id: 41, title: 'Offline browser article', publishedAt: '2026-10-01T12:00:00Z',
      content: '<p>Full article body available after an offline cold reload.</p>', contentText: 'Full article body available after an offline cold reload.',
      status: 'unread', favoriteInd: 1, feedId: 2, feed: { id: 2, name: 'Browser feed' }, tags: [] };
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
      if (url.pathname === '/api/auth/configuration') data = { localAuthEnabled: true };
      if (url.pathname === '/api/setting') data = { status: '%', viewMode: 'full', sort: 'desc', grouping: 'none', onboardingCompleted: true };
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
        const request = indexedDB.open('rssmonster-offline', 1);
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
          const request = indexedDB.open('rssmonster-offline', 1);
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
    assert.equal(snapshotRefreshes, 1, `recovery refreshes exactly once: ${JSON.stringify(articleQueries)}`);
    offline = true;
    await context.setOffline(true);
    await appPage.getByText(/Downloaded articles · Offline reading/).waitFor();
    invalid = true;
    offline = false;
    await context.setOffline(false);
    await appPage.getByText('Sign in to RSSMonster', { exact: true }).waitFor();
    assert.equal((await context.cookies()).some(cookie => cookie.name === 'token'), false, 'invalid recovery logs out');
    assert.deepEqual(appErrors, []);
    console.log('PASS: service-worker-controlled offline cold startup, desktop/mobile article body rendering, authenticated recovery, one snapshot refresh and invalid-session logout');
    await appPage.close();
  }
} finally {
  await browser.close();
}
