import assert from 'node:assert/strict';

// Use an existing Playwright installation; never download a browser implicitly.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.READING_BROWSER_EXECUTABLE ? { executablePath: process.env.READING_BROWSER_EXECUTABLE } : {})
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:5173'}/tests/browser/reading.html`);
  await page.waitForFunction(() => Boolean(window.readingTest));
  const state = () => page.evaluate(() => ({
    active: window.readingTest.context.activeReadingArticleId,
    durations: Object.fromEntries(window.readingTest.context.visibleDuration),
    summaries: window.readingTest.summaries
  }));
  await page.clock.runFor(1000);
  assert.equal((await state()).active, null, 'nested panel clips content below its viewport');
  assert.equal((await state()).summaries.length, 0, 'clipped content receives no evidence');

  await page.locator('#panel').evaluate(panel => { panel.scrollTop = 400; });
  await page.clock.runFor(1000);
  assert.equal((await state()).active, 1, 'real panel scrolling selects readable content');
  await page.clock.runFor(60000);
  await page.evaluate(() => window.readingTest.context.finishReadingSession());
  const first = (await state()).durations[1];
  assert.ok(first >= 60000 && first <= 62000, `stationary visible time: ${first}`);

  await page.evaluate(() => window.readingTest.select(2));
  await page.clock.runFor(20000);
  await page.evaluate(() => window.readingTest.context.finishReadingSession());
  const final = await state();
  assert.equal(final.durations[1], first, 'Reader navigation stops the previous article');
  assert.ok(final.durations[2] >= 19000 && final.durations[2] <= 21000, 'new Reader content receives only its interval');
  assert.ok(final.summaries.every(summary => summary.options.attentionOnly), 'reading does not request read-state changes');
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.readingTest.context.teardownObservers());
  console.log('PASS: real viewport clipping, nested scrolling, stationary reading and Reader navigation');
} finally {
  await browser.close();
}
