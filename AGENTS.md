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

## Stack

* Node.js `>=22.19.0`; npm; JavaScript ESM only.
* Client: Vue 3 + Vite. Server: Express 5 + Sequelize.
* Tests: Vitest. Linting: ESLint.
* Never introduce CommonJS `require()` or `module.exports`.
* Models are initialized through `server/models/index.js`; reuse the existing factory pattern.

## Commands

Use repository scripts; do not assume globally installed tools.

```bash
cd client && npm test && npm run lint && npm run build
cd server && npm test && npm run lint
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

Semantic features are probabilistic. Use deterministic eligibility rules, bounded candidate sets, ownership/visibility filtering, and meaningful thresholds. Zero recommendations is valid.

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

For behavior changes, add focused regression tests when the area has an established testing pattern.

Before finishing:

1. run relevant tests;
2. run relevant linting;
3. run a build when appropriate;
4. inspect `git diff` and `git status`;
5. verify only expected files changed.

If validation cannot be run, state that clearly.

## Permissions

Allowed without asking: inspect/search files, edit task-related files, run focused tests/lint/builds, and inspect git diff/status.

Do not do unless explicitly requested: install/upgrade dependencies; run migrations, seeds, resets, repairs, or backfills; deploy; push/merge remote branches; modify production data.

Never commit secrets, credentials, tokens, or environment-specific private values.

## Audits

When asked to audit, investigate, review, or analyze, do not modify code unless implementation is also requested. Separate confirmed issues from suggestions and support conclusions with repository evidence.

## Final Standard

Prefer: `inspect before assuming · reuse before creating · extend before replacing · fix before refactoring · bounded before unbounded`

Code should feel deliberately written for RSSMonster, not generically generated for a Vue/Express application.