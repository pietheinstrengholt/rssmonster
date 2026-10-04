import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.READING_BROWSER_CHANNEL ? { channel: process.env.READING_BROWSER_CHANNEL } : {}),
  ...(process.env.READING_BROWSER_EXECUTABLE ? { executablePath: process.env.READING_BROWSER_EXECUTABLE } : {})
});
try {
  for (const width of [390, 768, 1440]) {
    for (const mode of ['minimal', 'full', 'reader']) {
      for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const failures = [];
        page.on('pageerror', error => failures.push(error.message));
        let tags = [{ id: 10, name: 'existing', tagType: 'rule' }];
        let nextId = 11;
        await page.route('**/api/**', async route => {
          const request = route.request();
          const url = new URL(request.url());
          const path = url.pathname;
          if (!path.startsWith('/api/')) return route.continue();
          let data = {};
          if (path === '/api/articles/42') data = { article: { id: 42, tags } };
          else if (path === '/api/tags' && url.searchParams.get('scope') === 'all') {
            let names = ['existing', 'news', 'sports', ...Array.from({ length: 10000 }, (_, index) => `topic-${index}`)];
            const query = url.searchParams.get('search') || '';
            const limit = Number(url.searchParams.get('limit'));
            names = names.filter(name => name.includes(query)).sort((a, b) => Number(b === query) - Number(a === query) || a.localeCompare(b));
            data = { tags: names.slice(0, limit).map(name => ({ name })), hasMore: limit < names.length };
          } else if (path === '/api/tags') data = { tags: [{ name: 'news', count: 4 }] };
          else if (path === '/api/articles/42/tags') {
            for (const name of request.postDataJSON().tags) if (!tags.some(tag => tag.name === name)) tags.push({ id: nextId++, name, tagType: 'manual' });
            data = { tags };
          } else if (path.startsWith('/api/articles/42/tags/')) {
            tags = tags.filter(tag => tag.id !== Number(path.split('/').at(-1)));
            data = { tags };
          } else if (path === '/api/smartfolders/counts') data = { smartFolders: [] };
          await route.fulfill({ json: data });
        });
        await page.goto(`${process.env.READING_TEST_BASE_URL || 'http://localhost:8080'}/tests/browser/article-tags.html?mode=${mode}&theme=${theme}`);
        const trigger = page.getByRole('button', { name: 'Article actions', exact: true }).first();
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Add tags', exact: true }).click();
        const dialog = page.getByRole('dialog');
        const search = dialog.getByRole('searchbox', { name: 'Search tags' });
        await search.waitFor();
        await dialog.getByText('Loading current tags…').waitFor({ state: 'hidden' });
        assert.equal(await search.evaluate(element => document.activeElement === element), true);
        assert.equal(await dialog.getByRole('button', { name: 'Tag Existing already assigned' }).isDisabled(), true);
        assert.ok(await dialog.getByRole('checkbox').count() <= 20);
        await search.fill('s');
        await dialog.getByRole('checkbox', { name: 'Existing', exact: true }).waitFor();
        await dialog.getByText('Searching…').waitFor({ state: 'hidden' });
        assert.equal(await dialog.getByRole('button', { name: 'Add tags', exact: true }).isDisabled(), true);
        const orderedNames = () => dialog.locator('label').allTextContents().then(names => names.map(name => name.trim()));
        const sports = dialog.getByRole('checkbox', { name: 'Sports', exact: true });
        await dialog.locator('label').filter({ hasText: /^Sports$/ }).click();
        assert.equal(await sports.isChecked(), true);
        assert.deepEqual((await orderedNames()).slice(0, 3), ['Existing', 'Sports', 'News']);
        await sports.focus();
        await page.keyboard.press('Space');
        assert.equal(await sports.isChecked(), false);
        assert.equal(await sports.evaluate(element => document.activeElement === element), true, 'keyboard focus survives deselection ordering');
        await page.keyboard.press('Space');
        assert.equal(await sports.isChecked(), true);
        assert.equal(await sports.evaluate(element => document.activeElement === element), true, 'keyboard focus survives selection ordering');
        await search.fill('s');
        assert.deepEqual(await orderedNames(), ['Existing', 'Sports', 'News']);
        await sports.uncheck();
        await search.fill('topic-104');
        await dialog.getByRole('checkbox', { name: 'Topic-104', exact: true }).waitFor();
        await search.fill('Research');
        await dialog.getByRole('button', { name: 'Create new tag', exact: true }).click();
        await dialog.getByRole('button', { name: 'Create', exact: true }).click();
        await dialog.getByRole('button', { name: 'Remove tag Research', exact: true }).waitFor();
        const panel = await dialog.boundingBox();
        assert.ok(panel.x >= 0 && panel.x + panel.width <= width, `${width}px ${mode} ${theme}: dialog fits the viewport`);
        const overflow = await dialog.evaluate(element => element.scrollWidth > element.clientWidth);
        assert.equal(overflow, false);
        if (process.env.ARTICLE_TAG_SCREENSHOT_DIR && mode === 'full' && [390, 1440].includes(width)) {
          await search.fill('research');
          await page.screenshot({ path: `${process.env.ARTICLE_TAG_SCREENSHOT_DIR}/article-tags-${width}-${theme}.png` });
        }
        await dialog.getByRole('button', { name: 'Add tags', exact: true }).focus();
        await page.keyboard.press('Tab');
        assert.equal(await dialog.getByRole('button', { name: 'Close dialog' }).evaluate(element => document.activeElement === element), true);
        await dialog.getByRole('button', { name: 'Add tags', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Filter articles by tag Research', exact: true }).waitFor();
        assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
        assert.ok(JSON.parse(await page.locator('body').getAttribute('data-article-tags')).some(tag => tag.name === 'research'));
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Manage tags', exact: true }).click();
        await dialog.getByRole('button', { name: 'Remove tag Research' }).click();
        await dialog.getByRole('checkbox', { name: 'News', exact: true }).click();
        await dialog.getByRole('button', { name: 'Remove tag News' }).waitFor();
        await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.ok(tags.some(tag => tag.name === 'news'));
        assert.ok(!tags.some(tag => tag.name === 'research'));
        await page.getByRole('button', { name: 'Filter articles by tag News', exact: true }).first().waitFor();
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Add tags', exact: true }).click();
        await search.waitFor();
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Manage tags', exact: true }).click();
        await dialog.getByText('Loading current tags…').waitFor({ state: 'hidden' });
        const longName = 'x'.repeat(255);
        await search.fill(longName);
        await dialog.getByRole('button', { name: 'Create new tag', exact: true }).click();
        await dialog.getByRole('button', { name: 'Create', exact: true }).click();
        assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth || [...element.querySelectorAll('*')].some(child => child.scrollWidth > child.clientWidth + 1 && getComputedStyle(child).overflowX === 'visible')), false, 'long selected labels fit the dialog');
        await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'long article labels do not overflow the page');
        assert.deepEqual(failures, []);
        await page.close();
      }
    }
  }
  console.log('PASS: article tagging, bounded server search, inline creation, local parent updates, removal, keyboard focus and viewport fit in 18 layout/theme combinations');
} finally {
  await browser.close();
}
