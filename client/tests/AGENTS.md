# Client tests

Use Vitest. Test what the user sees and does, not Vue internals.

> A behavior-preserving UI refactor should normally not require test changes.

Before writing tests, read the component/composable and existing nearby tests.

## Prefer

Test:

* visible content
* clicks, typing, selection
* loading, empty, and error states
* enabled/disabled state
* filtering and sorting
* navigation outcomes
* composable and utility contracts

Interact like a user:

```text
render
→ click/type/select
→ observe result
```

Prefer selectors based on:

* role
* accessible name
* label
* visible text
* intentional test IDs when needed

Keep fixtures small. Generate repetitive data and hardcode only relevant values.

Use short behavioral names:

```text
shows unread articles only
disables refresh while crawling
opens the selected article
```

## Avoid

Do not assert:

* private methods
* refs or computed internals
* watcher calls
* lifecycle ordering
* DOM hierarchy
* CSS classes
* generated markup details

Do not let replacing a `<div>` with a `<section>` break a test.

Mock only boundaries such as HTTP, browser APIs, clocks, or external services.

Do not mock every child component or composable.

Prefer visible outcomes over checking exact API-helper call sequences.

Avoid large DOM snapshots. Snapshots are not the default.

Use Vitest APIs only: `vi.fn`, `vi.mock`, `vi.spyOn`.

Never use arbitrary sleeps. Wait for the observable UI condition instead.

When an existing test fails after a behavior-preserving refactor, fix the brittle test rather than restoring the old implementation.

## Run

Always run in non-watch mode:

```bash
npm test -- --run
```

or:

```bash
npx vitest run
```

Run the affected test first, then the relevant suite.