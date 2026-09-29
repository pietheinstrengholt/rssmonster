import assert from 'node:assert/strict';

// Reuse an installed browser and Playwright, as in test-reading-browser.js.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.ARTICLE_MENU_BROWSER_CDP
  ? await chromium.connectOverCDP(process.env.ARTICLE_MENU_BROWSER_CDP)
  : await chromium.launch({
    headless: true,
    ...(process.env.READING_BROWSER_EXECUTABLE ? { executablePath: process.env.READING_BROWSER_EXECUTABLE } : {})
  });
try {
  const page = await browser.newPage();
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    for (const mode of ['expanded', 'minimal']) {
      for (const theme of ['light', 'dark']) {
        await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:5173'}/tests/browser/article-menu.html?mode=${mode}&theme=${theme}`);
        const trigger = page.getByRole('button', { name: 'Article actions', exact: true }).first();
        await trigger.click();
        const menu = page.getByRole('menu');
        await menu.waitFor({ state: 'visible' });
        const exposed = await menu.getByRole('menuitem').evaluateAll(items => items.every(item => {
          const rect = item.getBoundingClientRect();
          return item.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        }));
        assert.ok(exposed, `${mode}, ${theme}, ${viewport.width}px: every action must be exposed over adjacent articles`);
        if (mode === 'minimal') {
          await menu.getByRole('menuitem', { name: 'Mark as read', exact: true }).click();
          assert.equal(await page.locator('body').getAttribute('data-selected-article'), '1');
          assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
          await trigger.click();
        }
        await page.keyboard.press('Escape');
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      }
    }
  }
  await page.close();
  console.log('PASS: mobile/tablet article menus cover adjacent articles in both layouts and themes; selection and Escape close the menu');
} finally {
  await browser.close();
}
