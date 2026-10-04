import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.SMART_FOLDER_BROWSER_EXECUTABLE ? { executablePath: process.env.SMART_FOLDER_BROWSER_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, theme] of [[320, 'light'], [375, 'dark'], [768, 'light'], [1083, 'dark'], [1084, 'light'], [1280, 'dark']]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${process.env.SMART_FOLDER_TEST_BASE_URL || 'http://localhost:5173'}/tests/browser/current-view-smart-folder.html`);
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    if (width < 1084) {
      assert.equal(await page.getByRole('button', { name: 'Save as smart folder', includeHidden: true }).isVisible(), false, `save control hidden at ${width}px`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no page overflow at ${width}px`);
      continue;
    }
    await page.getByRole('button', { name: 'Save as smart folder' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    const rect = await dialog.boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= width, `popover fits ${width}px viewport`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no page overflow at ${width}px`);
    assert.ok(await page.getByLabel('Folder name').evaluate(input => document.activeElement === input), 'name is focused');
    const reference = page.getByRole('region', { name: 'Article badge references' });
    const appearance = locator => locator.evaluate(element => {
      const style = getComputedStyle(element);
      return Object.fromEntries(['color', 'backgroundColor', 'borderRadius', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'borderWidth'].map(property => [property, style[property]]));
    });
    for (const [chip, badge] of [
      ['Recommended', reference.getByRole('button', { name: 'Reference Recommended' })],
      ['Group by event', reference.getByRole('button', { name: /sources/ })],
      ['Quality >= 80', reference.getByRole('button', { name: /Quality 80 out of 100/ })]
    ]) {
      assert.deepEqual(await appearance(dialog.getByText(chip, { exact: true })), await appearance(badge), `${chip} matches the article badge in ${theme} theme`);
    }
    await page.getByLabel('Folder name').press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Save as smart folder' }).click();
    await page.locator('body').click({ position: { x: 1, y: 750 } });
    await dialog.waitFor({ state: 'hidden' });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: save control hidden below 1084px; visible at 1084px and above; badge styles, focus, Escape and outside click work');
} finally {
  await browser.close();
}
