# Server tests

Use Vitest. Test behavior, not implementation.

> A behavior-preserving refactor should normally not require test changes.

Before writing tests, read the implementation and existing nearby tests.

## Prefer

* returned values and errors
* HTTP status and response contracts
* persisted state
* validation and authorization
* state transitions and idempotency
* boundaries and edge cases
* ranking/scoring/clustering invariants

Prefer behavioral assertions:

```js
expect(highInterest.score).toBeGreaterThan(lowInterest.score);
```

over duplicating production formulas.

Keep tests small and focused. Use minimal fixtures and factories with overrides.

```js
createArticle({ favorite: true, positiveInd: 3 });
```

Use short behavioral names:

```text
rejects articles without a feed
keeps duplicates out of an event
ranks stronger interests higher
```

## Avoid

Do not assert:

* private helper calls
* internal call order
* exact helper invocation counts
* generated SQL
* temporary objects
* implementation-specific delegation

Do not mock internal modules just to verify they were called.

Mock only real boundaries such as external APIs, inference providers, clocks, or randomness.

If behavior depends on Sequelize queries, transactions, associations, or constraints, prefer a database integration test.

Use targeted assertions or `toMatchObject()` instead of full-object equality with irrelevant fields.

Snapshots are not the default.

Use Vitest APIs only: `vi.fn`, `vi.mock`, `vi.spyOn`.

Control time with fake timers when testing freshness, decay, expiry, or scheduling.

Never use arbitrary sleeps.

When an existing test fails after a behavior-preserving change, fix the brittle test rather than restoring the old implementation.

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