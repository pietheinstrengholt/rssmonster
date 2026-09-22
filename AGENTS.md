# AGENTS.md

## Purpose

RSSMonster is a self-hosted RSS reader built with Vue 3, Express 5, Sequelize, and Node.js.

Make small, correct changes that fit the existing architecture.

Default workflow: `inspect → understand → implement → test → lint → review diff`

## Working Rules

* Inspect relevant code before editing.
* Check callers, tests, nearby patterns, models, and services when relevant.
* Prefer repository evidence over assumptions.
* Make the smallest change that fully solves the task.
* Preserve behavior outside the requested scope.
* Reuse existing helpers, services, composables, and patterns before creating new ones.
* Preserve existing comments unless incorrect or obsolete.
* Do not combine requested work with unrelated refactoring, formatting, renaming, cleanup, or file moves.
* If required behavior cannot be established from the repository, explain the uncertainty instead of inventing it.
* Never invent model fields, associations, API properties, constraints, routes, service contracts, or breakpoints.
* Avoid over-engineering: implement the simplest robust solution for the stated requirements, and do not add speculative abstractions, defensive checks, or edge-case handling unless there is concrete evidence they are needed.
* When changing behavior, update the relevant tests, run them before considering the change complete, and if they fail, fix either the implementation or the test and rerun until they pass; never leave CI failures for after commit/push.
* When committing changes, prefix the commit message with exactly one of: docs:, fix:, feature:, refactor:, test:, or chore:, choosing the type that best describes the change.

## Stack

* Node.js `>=22.19.0`; npm; JavaScript ESM only.
* Client: Vue 3 + Vite. Server: Express 5 + Sequelize.
* Tests: Vitest. Linting: ESLint.
* Never introduce CommonJS `require()` or `module.exports`.
* Models are initialized through `server/models/index.js`; reuse the existing factory pattern.

## Commands

Use repository scripts; do not assume globally installed tools.

```bash
cd client && npm run test:coverage && npm run lint && npm run build
cd server && npm run test:ci && npm run lint
```

Prefer focused tests first when possible. Do not run migrations, seeds, repair/backfill scripts, semantic rebuilds, deployment commands, or other production-oriented operations unless explicitly requested or required by the task. Never claim a check passed unless it actually ran successfully.

## Backend

* Routes are mounted under `/api/*`.
* Keep controllers focused on validation, ownership/visibility, orchestration, and responses.
* Reuse existing domain/service logic instead of duplicating it.
* Treat API response shapes as contracts; inspect callers before changing them.
* Inspect models, indexes, constraints, and transaction usage before changing persistence logic.
* Avoid N+1 queries and unnecessarily unbounded queries.
* RSSMonster is multi-user: direct and indirect results must respect existing ownership and visibility rules.

## Domain Invariants

Inspect existing behavior before changing:

* article identity, revisions, duplicates, and canonical records;
* filtering and visibility;
* content normalization;
* feed crawling and health;
* semantic recommendations and clustering.

Article processing conceptually follows:
`extraction → identity → normalization → revision handling → duplicate detection → filtering → AI enrichment → persistence`

Do not reorder these stages casually.

`contentOriginal`, `contentStripped`, `contentText`, and `description` are distinct contracts. Do not treat them as interchangeable.

Deterministic identity takes precedence over semantic similarity. Similar content is not automatically duplicate content.

A repeated feed item may be a revision rather than a new article. Preserve identity and user state according to existing revision semantics.

Semantic features are probabilistic. Use deterministic eligibility rules, bounded candidate sets, ownership/visibility filtering, and meaningful thresholds. Zero semantic matches or an empty eligible result set is valid; every eligible Article must still receive a finite Recommended score with neutral interest when unmatched.

For every semantic architecture/behavior change, follow
[the service invariants](server/services/AGENTS.md) and the required
[before/after test workflow](server/tests/semantic/README.md#required-beforeafter-workflow-for-semantic-changes).
Run `npm run test:semantic-trace` from `server/` before implementation and after
the final change. Preserve both runs' logs/reports and compare initial/final
metrics, memberships, held-out results, failures and runtime in the final report.
This also applies to semantic configuration, embedding inputs, scoring and
fixture/runner changes. Keep model, vectors and corpus constant unless their
change is explicitly in scope; disclose differences and unavailable baselines.
Do not weaken regression
expectations or semantic thresholds to make coverage or tests look better. Event
occurrence identity and personal interest are different problems.
Keep final Recommended weights unchanged when improving semantic evidence unless
weight changes are explicitly requested.

For crawl changes, preserve useful failure, timing, retry, and recovery information. Avoid retry storms and parallel crawler implementations when existing fetch/crawl logic can be reused.

## Frontend

* Follow existing Vue Single File Component patterns.
* Keep rendering/interaction in components, reusable reactive behavior in composables, and API/non-visual logic in services where the existing architecture supports it.
* Do not extract CSS or JavaScript merely to reduce component size.
* Reuse existing API services and normalization logic.
* Preserve distinctions between Reader, Expanded, mobile, and tablet layouts; do not assume a feature belongs everywhere.
* Prefer CSS for layout behavior; reuse existing responsive logic when JavaScript behavior depends on layout.
* Consider both light and dark mode for themed UI changes.
* Preserve semantic controls, keyboard access, focus states, and accessible names.

## Code Style

* Follow surrounding code.
* Prefer concise, readable JavaScript and compact single-expression assignments when clear.
* Prefer early returns over unnecessary nesting.
* Avoid clever abstractions and speculative generalization.
* Add dependencies only when the existing stack cannot reasonably solve the problem.
* Comment non-obvious domain rules or intentional behavior, not obvious code.

## Validation

### Vector and CI contract

* Never commit model-generated embedding vectors, vector datasets/caches, or model
  binaries to this repository. This applies to every encoding and container,
  including JSON, compressed snapshots, archives, renamed bundles and Git LFS.
  Do not force-add ignored artifacts or embed generated vectors in source files.
* Keep generated vectors and semantic reports local and ignored. Small hand-written
  numeric inputs in unit tests are test code, not exported model embeddings.
* `.github/workflows/ci.yml` must not run semantic regression/evaluation suites or
  generate, download, restore or upload their vectors. Use `npm run test:ci` for
  server coverage; keep ordinary Event, Island and recommendation service tests.
* Run model-backed semantic evaluation explicitly outside CI with local caches.
  Missing local caches must be reported, not worked around by committing vectors.
  Put new vector-dependent evaluation tests under `server/tests/semantic/` so the
  CI boundary also covers future additions.
* Run `npm run check:vector-artifacts --prefix server` before committing. It checks
  tracked/staged artifact paths, including files added with `git add -f`; review
  diffs as well because renamed or embedded data cannot be recognized by filename alone.

For behavior changes, add focused regression tests when the area has an established testing pattern.

### Validation before completion

* Run focused tests during implementation. Before declaring code changes complete,
  run the full CI test command for each affected workspace after the final change.
* Backend changes: run `npm run test:ci` and `npm run lint` from `server/` against
  the isolated MySQL test database.
* Client changes: run `npm run test:coverage`, `npm run lint`, and `npm run build`
  from `client/`.
* Model or migration changes: also run `npm run test:sqlite` from `server/` with
  `DB_DIALECT=sqlite` and an isolated `DB_STORAGE` path, preparing the test schema
  as CI does. Inspect historical-schema fixtures that use current models and
  ensure their setup includes the required columns.
* Use `.github/workflows/ci.yml` as the source of truth for runtime versions,
  environment settings, setup, and validation commands, including other affected
  workspaces such as `inference/`.
* Run database-resetting suites sequentially against isolated test databases.
  Required test setup, including migrations, seeds, and resets on those isolated
  databases, is authorized without asking. This does not authorize operations on
  development or production data.
* Focused tests and semantic traces do not substitute for the full CI suite.
  Preserve the separate before/after semantic validation requirements above.
* Fix failures and rerun the required checks before declaring completion. If a
  required check cannot run, identify it and the blocker explicitly; do not
  describe the change as fully validated.
* Before finishing, inspect `git diff` and `git status` and verify only expected
  files changed. For documentation-only changes, verify referenced commands and
  contracts; application test suites are not required.

## Permissions

Allowed without asking: inspect/search files, edit task-related files, run focused and full test suites/lint/builds with the isolated test setup described above, and inspect git diff/status.

Do not do unless explicitly requested: install/upgrade dependencies; run migrations, seeds, resets, repairs, or backfills outside the isolated test setup described above; deploy; push/merge remote branches; modify production data.

Never commit secrets, credentials, tokens, or environment-specific private values.

## Audits

When asked to audit, investigate, review, or analyze, do not modify code unless implementation is also requested. Separate confirmed issues from suggestions and support conclusions with repository evidence.

## MySQL performance

For MySQL/Sequelize query-performance investigations, use the `mysql-performance` skill. You may inspect the local MySQL slow-query and error logs and query the local development Performance Schema without asking the user to paste diagnostic output.

## Final Standard

Prefer: `inspect before assuming · reuse before creating · extend before replacing · fix before refactoring · bounded before unbounded`

Code should feel deliberately written for RSSMonster, not generically generated for a Vue/Express application.
