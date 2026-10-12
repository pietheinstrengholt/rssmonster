import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.READING_BROWSER_EXECUTABLE ? { executablePath: process.env.READING_BROWSER_EXECUTABLE } : {})
});
try {
  for (const width of [390, 768, 900, 1440]) {
    for (const theme of ['light', 'dark']) {
      for (const [legacy, canonical] of [['full', 'expanded'], ['minimal', 'headlines']]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const failures = [];
        const saves = [];
        page.on('pageerror', error => failures.push(error.message));
        await page.route('**/api/**', async route => {
          if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue();
          if (route.request().method() === 'PATCH' && new URL(route.request().url()).pathname === '/api/setting/view-mode') {
            saves.push(route.request().postDataJSON().viewMode);
          }
          await route.fulfill({ json: {} });
        });
        await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:8080'}/tests/browser/reading-modes.html?storedMode=${legacy}&theme=${theme}`);
        const selected = page.getByRole('status', { name: 'Selected reading mode' });
        await selected.waitFor();
        assert.equal(await selected.textContent(), canonical);
        const modes = [['Reader', 'reader'], ['Expanded', 'expanded'], ['Summarized', 'summarized'], ['Summary bullets', 'summaryBullets'], ['Headlines', 'headlines']];
        for (const [label, value] of modes.filter(([, value]) => width >= 880 || value !== 'reader')) {
          if (width < 880) {
            await page.getByRole('button', { name: 'Reading options', exact: true }).click();
            assert.equal(await page.getByRole('button', { name: /^Reader(?:\s|$)/ }).count(), 0);
            await page.getByRole('button', { name: new RegExp(`^${label}(?:\\s|$)`) }).click();
            await page.getByRole('button', { name: 'Close menu', exact: true }).waitFor({ state: 'hidden' });
          } else {
            await page.locator('#viewModeDropdown').click();
            await page.getByRole('menuitem', { name: label, exact: true }).click();
          }
          await page.waitForFunction(expected => document.querySelector('output').textContent === expected, value);
          assert.equal(await selected.textContent(), value);
          await page.getByText('Reading mode article', { exact: true }).first().waitFor();
          if (value === 'headlines') {
            await page.getByText('Reading mode article', { exact: true }).first().click();
          }
          const expectedBody = value === 'summaryBullets' ? 'First summary point'
            : value === 'summarized' ? 'Plain article preview for scanning.' : 'Rich article body for reading.';
          await page.getByText(expectedBody, { exact: true }).waitFor();
        }
        assert.deepEqual(saves, modes.filter(([, value]) => width >= 880 || value !== 'reader').map(([, value]) => value));
        assert.deepEqual(failures, []);
        await page.close();
        console.log(`PASS: ${width}px ${theme}, restored ${legacy}`);
      }
    }
  }
  for (const width of [320, 390, 768]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/')
        ? route.fulfill({ json: {} }) : route.continue());
      await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:8080'}/tests/browser/reading-modes.html?storedStatus=briefing&theme=${theme}`);
      const trigger = page.getByRole('button', { name: 'Daily briefing global 1234', exact: true });
      await trigger.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const label = trigger.getByText('Daily briefing', { exact: true });
      assert.ok(await label.evaluate(element => element.scrollWidth <= element.clientWidth),
        `${width}px ${theme}: the complete Briefing label must fit above its global count`);
      await trigger.click();
      await page.getByRole('menuitem', { name: 'Daily briefing (global) 1234', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      await page.close();
    }
  }
  console.log('PASS: legacy preferences restore canonical modes; desktop/mobile labels, saves and all rendered modes work at 390/768/900/1440px in light/dark themes');
  console.log('PASS: complete Briefing label and global count at 320/390/768px in both themes; dropdown and Escape remain usable');
} finally { await browser.close(); }
