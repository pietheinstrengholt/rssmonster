# Reading evidence acceptance tests

The acceptance coverage reuses the production visibility helper, ArticleFeed
navigation handler, read-state API adapter and backend controller.

| Area | Coverage |
| --- | --- |
| Timing | `article-reading-time.test.js`: stationary reading, hidden-tab exclusion, timer expiry at 120 seconds, activity renewal, retry and cleanup |
| Layout/navigation | Same suite: Minimal exposure/opening, Reader switching, Expanded single-article attribution and boundary stability |
| State/settings | Same suite: all three layouts × read/unread × automatic mark-read enabled/disabled |
| Persistence | `article-feed-read-state.test.js` and server `articleInteractionTime.test.js`: independent observation/state requests, bucket boundaries, preserved timestamps, grouped and bulk reads |
| Browser geometry | `scripts/test-reading-browser.js`: real nested clipping and scrolling, stationary time, Reader navigation through the production handler |

Run from `client/`:

```sh
npm test -- --run tests/article-reading-time.test.js tests/article-feed-read-state.test.js
```

Run from `server/`, using the repository's isolated test database configuration:

```sh
npm test -- --run tests/controllers/articleInteractionTime.test.js
```

For the browser check, start `npm run dev -- --host 127.0.0.1 --port 5173` in
one terminal, then run `npm run test:reading-browser` in another. It requires an
existing Playwright installation and Chromium browser; the runner does not install
or download either. If they are outside normal module/browser discovery, set:

- `PLAYWRIGHT_MODULE`: module specifier or file URL to the installed Playwright ESM entry.
- `READING_BROWSER_EXECUTABLE`: path to Chromium, Chrome or Edge.
- `READING_TEST_BASE_URL`: optional Vite URL (default `http://localhost:5173`).

The browser fixture uses actual layout, DOM events and IntersectionObserver, with
Playwright's controllable clock. Persistence is captured locally; it does not
connect to a user account or write article data. It exercises the production
navigation handler in a small fixture, not the full authenticated application.
It is separate from Vitest's jsdom suite and is not silently skipped when a
browser is missing. Headless Edge is the validated browser for this change.

These tests establish measurement and persistence correctness. Whether a bucket
matches a person's perceived engagement still requires a short manual trial.
