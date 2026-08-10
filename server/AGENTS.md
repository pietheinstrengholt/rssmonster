# AGENTS.md

## Scope

Applies to `server/`.

Follow the root `AGENTS.md` first. This file adds backend-specific rules only.

RSSMonster uses Express 5, Sequelize, ESM, background workers, feed crawling, and semantic processing.

## Commands

```bash
cd server
npm test
npm run lint
```

Prefer focused tests first:

```bash
npx vitest run path/to/test.js
```

Do not run migrations, seeds, repair/backfill commands, semantic rebuilds, or production jobs unless explicitly required.

## Before Editing

Inspect the relevant route, controller, models, services/helpers, callers, and tests before changing behavior.

Do not infer schema or domain contracts from one file.

## Models and Sequelize

* Use ESM only.
* Import initialized models from `models/index.js`.
* Do not initialize Sequelize models independently.
* Never invent fields, associations, indexes, or constraints.
* Inspect models and migrations before changing persistence behavior.
* Prefer database filtering over broad in-memory filtering.
* Avoid N+1 and unnecessarily unbounded queries.
* Preserve existing transaction and concurrency behavior unless explicitly changing it.

Example:

```js
import db from '../models/index.js';

const { Article, Feed } = db;
```

## Controllers and APIs

* Routes are mounted under `/api/*`.
* Keep controllers focused on validation, ownership, orchestration, and responses.
* Reuse existing services/helpers instead of duplicating domain logic.
* Treat API response shapes as contracts.
* Search callers before changing response fields.
* Prefer additive API changes when practical.
* Do not expose stack traces, secrets, or unnecessary internal details.

## Ownership

RSSMonster is multi-user.

All user-facing queries must preserve existing ownership and visibility rules, including indirect access through duplicates, recommendations, semantic queries, search, folders, tags, feed validation, joins, and includes.

A valid record ID is not authorization.

## Article Pipeline

Conceptual order:

`extraction → identity → normalization → revisions → duplicates → filtering → AI enrichment → persistence`

Do not reorder these stages without tracing dependencies.

`contentOriginal`, `contentStripped`, `contentText`, and `description` are distinct contracts.

Prefer fixing canonical article data once instead of adding caller-specific transformations.

## Identity and Revisions

* Deterministic identity takes precedence over semantic similarity.
* Similarity alone does not establish duplication.
* Do not weaken duplicate rules for isolated feed edge cases.
* A fetched item may be a revision of an existing article.
* Preserve article identity, user state, and existing field-retention semantics.
* Be careful with filtered records, canonical duplicates, unique constraints, and race recovery.

## Feed Crawling

* Reuse existing crawl/fetch logic.
* Preserve useful status, timeout, failure, duration, retry, last-success, and recovery information.
* Be conservative with retries and avoid retry storms.
* Manual validation should remain a targeted diagnostic action.
* Preserve explicit timeout behavior for network requests.

## Workers and Scripts

* Workers and scripts must initialize their own dependencies.
* Do not rely on state initialized only by the Express process.
* Share reusable logic instead of duplicating web/worker implementations.
* Avoid hidden process-local state that affects correctness.

## Semantic Features

* Apply deterministic eligibility rules before similarity calculations.
* Use bounded candidate sets.
* Enforce ownership and visibility.
* Exclude duplicates where appropriate.
* Use meaningful thresholds.
* Zero results is valid.
* Avoid full-table vector comparisons when a bounded relevant window is sufficient.
* Do not recompute semantic state unnecessarily.

## Testing

Prioritize regression tests for ownership, API contracts, identity, duplicates, revisions, filtering, crawl behavior, content normalization, semantic eligibility, and race recovery.

Test observable behavior rather than implementation details.

## Final Standard

Prefer:

`query narrowly · preserve ownership · preserve identity · reuse existing logic · deterministic before probabilistic`

Protect RSSMonster's data invariants before optimizing for implementation convenience.