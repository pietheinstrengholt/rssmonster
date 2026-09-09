import { app } from 'electron';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';

const fixture = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/rss+xml');
  res.end(`<rss version="2.0"><channel><title>Electron fixture</title>
    <link>https://example.com</link><description>Fixture</description><item>
    <title>Electron refresh article</title><guid>electron-refresh-1</guid>
    <link>https://example.com/electron-refresh-1</link><description>Reader fixture content.</description>
    <pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
process.env.RSSMONSTER_INTERNAL_HOST_ALLOWLIST = `127.0.0.1:${fixture.address().port}`;

const directory = mkdtempSync(path.join(tmpdir(), 'rssmonster-electron-test-'));
app.setPath('userData', directory);
app.on('quit', () => rmSync(directory, { recursive: true, force: true }));
app.once('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(`new Promise(resolve => {
        const check = () => {
          if (!document.querySelector('input')) return;
          observer.disconnect();
          resolve({ node: typeof process, title: document.title, inputs: document.querySelectorAll('input').length });
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, { childList: true, subtree: true });
        check();
      })`);
      assert.equal(result.node, 'undefined');
      assert.ok(result.inputs > 0);
      assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
      await window.webContents.executeJavaScript(`(async () => {
        const credentials = { username: 'electron-test', password: 'electron-test-password' };
        const api = async (route, body, token) => {
          const response = await fetch('/api' + route, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
            body: JSON.stringify(body)
          });
          if (!response.ok) throw new Error(route + ': ' + response.status);
          return response.json();
        };
        await api('/auth/register', { ...credentials, password_repeat: credentials.password });
        const { token } = await api('/auth/login', credentials);
        const category = await api('/categories', { name: 'Electron feeds' }, token);
        await api('/feeds', { categoryId: category.id, url: 'http://127.0.0.1:${fixture.address().port}/feed.xml' }, token);
        for (const [id, value] of Object.entries(credentials)) {
          const input = document.getElementById(id);
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.querySelector('.auth-form').requestSubmit();
        await new Promise(resolve => {
          const check = () => {
            const button = [...document.querySelectorAll('button')].find(element =>
              element.textContent.includes('Refresh feeds') || element.getAttribute('aria-label') === 'Refresh feeds');
            if (!button) return;
            observer.disconnect();
            resolve();
          };
          const observer = new MutationObserver(check);
          observer.observe(document.body, { childList: true, subtree: true });
          check();
        });
      })()`);
      const refreshed = new Promise(resolve => {
        window.webContents.session.webRequest.onCompleted(details => {
          if (details.url.endsWith('/api/feeds/refresh') && details.statusCode === 200) resolve();
        });
      });
      await window.webContents.executeJavaScript(`([...document.querySelectorAll('button')].find(element =>
        element.textContent.includes('Refresh feeds') || element.getAttribute('aria-label') === 'Refresh feeds')).click()`);
      await refreshed;
      const { waitForActiveCrawls } = await import('../../../server/controllers/crawl.js');
      await waitForActiveCrawls();
      const { default: db } = await import('../../../server/models/index.js');
      assert.equal(await db.Article.count(), 1);
      assert.equal(await db.ProcessingJob.count(), 0);
      console.log('Electron smoke passed: Vue login, refresh button, REST crawl, persisted article and renderer isolation.');
      await new Promise(resolve => fixture.close(resolve));
      window.close();
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
await import('../../main.js');
