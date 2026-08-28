---
layout: page
title: Server Jobs
parent: Administration
nav_order: 1
---

# Server Jobs

The server exposes its supported commands through `server/package.json`. Run
them from the server directory:

```bash
cd server
npm run <command>
```

Arguments intended for the underlying script must follow `--`:

```bash
npm run semantic:repair -- --userId=3
```

Some jobs connect to the configured database, update many rows, or call the
configured embedding provider. Do not run a repair, rebuild, seed, or reset as
a routine scheduler unless its description explicitly calls for that use.

## Application Processes

| Command | Purpose |
| --- | --- |
| `npm start` | Start the Express application with `node bootstrap.js`. This is the normal server start command. |
| `npm run start-server` | Alias for `npm start`; it starts the same `bootstrap.js` entry point. |
| `npm run start:worker` | Start the long-running crawl worker directly. It runs an immediate crawl iteration and continues polling; see [Crawling](crawling.md). |
| `npm run start:ai-worker` | Start the long-running durable processing-job consumer used by PM2 and MySQL Compose. |
| `npm run dev` | Start the Express server with Node's watch mode and restart it when server source files change. |
| `npm run debug` | Start the same watched development server with the Node inspector enabled. |

In production, use the repository's PM2 ecosystem definition to supervise the
web, crawl-worker, AI-worker, and inference processes instead of starting these
commands in separate shell sessions.

## Tests and Linting

| Command | Purpose |
| --- | --- |
| `npm test` | Run the complete server Vitest suite once. |
| `npm run test:coverage` | Run the suite once and produce V8 coverage output. |
| `npm run test:watch` | Run Vitest interactively in watch mode. |
| `npm run test:semantic-ad-event` | Run only the incremental semantic regression test for advertisement/event behavior. |
| `npm run lint` | Check the server tree with ESLint. |

These commands are verification tools. Tests use the test environment; they
are not production maintenance jobs.

## Database and Crawl Commands

| Command | Purpose |
| --- | --- |
| `npm run db` | Apply pending Sequelize migrations to the configured database. Run this during a controlled deployment and back up production data first. |
| `npm run crawl` | Perform one complete incremental crawl pipeline: fetch due feeds for all users, persist articles, generate embeddings, update Events and Topics, and refresh Interest Island scores. The command exits when the iteration finishes. |

`npm run crawl` is useful for a one-off run or external scheduling. It is not
the same as `npm run start:worker`, which keeps running and invokes that
pipeline repeatedly. Do not schedule both the worker and an OS cron crawl or
feeds will be checked twice.

## Semantic Maintenance

| Command | Purpose |
| --- | --- |
| `npm run semantic:repair` | Repair the recent semantic window for all users, or one user with `--userId=<id>`. It repairs Events and Topics and refreshes interest scores without rebuilding all history. |
| `npm run semantic:all` | Run a full historical semantic rebuild for all users. Supports `--userId=<id>` and `--batchSize=<count>`. This is substantially heavier than a recent repair. |
| `npm run semantic:model-rebuild` | Clear incompatible vectors and semantic state after changing embedding models, then rebuild vectors only for starred or clicked articles. Requires `--dry-run` or explicit `--confirm`; see [Model Usage](model-usage.md#reset-and-rebuild-an-existing-environment). |
| `npm run events` | Re-evaluate recent Event assignment independently of Topic construction. The default scope is `recent-repair`; pass `--scope=incremental` for only currently unassigned recent articles and optionally `--userId=<id>`. |
| `npm run events:backfill` | Backfill missing Events from historical vectorized articles and intentionally skip Topic assignment. The package command accepts additional `--userId=<id>` or `--batchSize=<count>` arguments. |
| `npm run topics` | Rebuild Topic assignments for all users. It defaults to `full-rebuild`; the script also accepts `--scope=recent-repair`, `--scope=incremental`, and `--userId=<id>`. |
| `npm run islands` | Recalibrate Interest Islands for users and refresh article interest scores. |
| `npm run backfill:engaged-vectors` | Generate missing embeddings for engaged articles. Supports `--dry-run`, `--userId=<id>`, `--batchSize=<count>`, and `--limit=<count>`. This can call the embedding provider. |
| `npm run taxonomy:vectors` | Reload the Interest Island taxonomy from its seed definition and generate taxonomy vectors. `--force` forces regeneration. This changes taxonomy data and requires an embedding provider. |
| `npm run reset:semantic` | Delete derived semantic state while retaining feeds and articles. Supports `--userId=<id>` and `--dry-run`. This is destructive and intended for testing, debugging, or a deliberate rebuild. |

Incremental commands retain and extend existing state. Repair commands revisit
a bounded or missing-data scope. Rebuild commands recalculate a much broader
scope. Reset removes derived state and should only be used when that loss is
intentional.

## Scoring, Seeding, and Repairs

| Command | Purpose |
| --- | --- |
| `npm run feedtrust` | Recalculate each feed's user-specific trust score from recent behavior, originality, consistency, volume, and negative signals. |
| `npm run seed:island-taxonomy` | Apply the named Sequelize seed that creates the Interest Island taxonomy. This changes database data. |
| `npm run seed:undo:island-taxonomy` | Undo that specific taxonomy seed. This removes seeded taxonomy data and is destructive. |
| `npm run seed:official-sources` | Create or update the built-in official-source rules. Pass `--userId=<id>` to scope it to one user. |
| `npm run hotlinks` | Rebuild recent article hotlink indicators and counts. It clears the existing indicators before recalculating them. |
| `npm run repair-duplicates` | Recalculate `Article.duplicateCount` values from stored duplicate relationships. |

## Regression Fixture Commands

These commands maintain test fixtures for contributors. They are not server
runtime jobs. Vector-generating commands require the configured inference
service to be running.

| Command | Purpose |
| --- | --- |
| `npm run fixture:semantic-export` | Export database content into the main semantic regression fixture. |
| `npm run fixture:semantic-vectors` | Generate or refresh vectors for the main semantic regression fixture. |
| `npm run fixture:semantic-incremental-vectors` | Generate vectors for the incremental semantic fixture. |
| `npm run fixture:semantic-incremental-unread-vectors` | Generate vectors for the incremental unread semantic fixture. |
| `npm run fixture:taxonomy-vectors` | Generate the checked test-vector fixture for the Interest Island taxonomy. |
| `npm run fixture:semantic-select -- --model=<model-id>` | Select an already complete model-specific vector set for semantic regression tests without regenerating other models. |
| `npm run test:semantic-report` | Run the semantic regression suite and write a concise, timestamped Markdown report under `server/tests/.semantic-regression/`. |
| `npm run test:semantic-trace` | Run the semantic suite with the detailed article-level console trace enabled. |

Before running any fixture generator, review its command-line options and the
resulting changes under `server/tests/fixtures`. These commands are intended to
update repository test data, not production records. Vector files are stored
per embedding model. The selector requires the baseline, incremental, unread,
and taxonomy vector files for the requested model to exist; it never combines
vectors from different models.
