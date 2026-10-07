import assert from 'node:assert/strict';

// Use an existing browser installation; never download dependencies or Chromium.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.READING_BROWSER_EXECUTABLE ? { executablePath: process.env.READING_BROWSER_EXECUTABLE } : {})
});
try {
  for (const width of [1800, 1251, 1250, 1249, 1200, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:5173'}/tests/browser/unread-context.html`);
    await page.waitForFunction(() => document.querySelector('#result').textContent !== 'pending');
    const report = JSON.parse(await page.locator('#result').textContent());
    assert.ok(report.cases > 0);
    assert.deepEqual(report.failures, []);
    assert.deepEqual(errors, []);
    console.log(`PASS: ${report.cases} top-bar resize/theme cases at ${width}px viewport, banner copy, row height, control alignment and overflow`);
    await page.close();
  }
} finally {
  await browser.close();
}
