---
layout: page
title: npm Commands
parent: Administration
nav_order: 4
---

# npm Commands

RSSMonster has separate npm packages for the Vue client, Express server, and
inference service. This page lists every command exposed by those packages,
what it does, and when to use it.

Run a command from the directory named in its section:

```bash
cd client     # or server, or inference
npm run <command>
```

`npm start` and `npm test` are npm shortcuts for `npm run start` and
`npm run test`. Install each package's dependencies before running its commands.

## Passing Arguments

Put `--` between an npm command and arguments for the underlying program:

```bash
cd server
npm run semantic:repair -- --userId=3
```

The **Arguments** column lists every option implemented by RSSMonster's own
scripts. `None` means that the RSSMonster script has no command-specific
arguments.

Commands backed directly by Vite, Vitest, ESLint, or Sequelize CLI also accept
options supported by the installed version of that tool. Their option sets can
change when dependencies are upgraded, so use the command's built-in help for
the complete, version-matched list:

```bash
npm run dev -- --help       # Vite, from client
npm test -- --help          # Vitest, from any package
npm run lint -- --help      # ESLint, from any package
npm run db -- --help        # Sequelize CLI, from server
```

Vitest commands also accept a file or name filter. For example,
`npm test -- tests/theme-service.test.js` runs one client test file. Do not pass
extra options to RSSMonster maintenance scripts unless they appear below; some
older scripts ignore unknown options instead of reporting an error.

## Client Commands

Run these commands from `client`. They are for developing, testing, and building
the Vue application; they do not operate on server data.

### Development, Tests, and Linting

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm run dev` | Vite CLI options | Starts the Vite development server with hot module replacement. Use it while changing the client. Vite chooses its normal development port unless an option or configuration overrides it. |
| `npm test` | Vitest filters and CLI options | Runs the complete client test suite once. Use it for normal verification and in CI. |
| `npm run test:coverage` | Vitest filters and CLI options | Runs client tests once with V8 coverage enabled. Use it when reviewing test coverage; it is slower than the normal test command. |
| `npm run test:watch` | Vitest filters and CLI options | Starts Vitest in interactive watch mode. Use it during client development when repeatedly editing related code and tests. |
| `npm run lint` | ESLint CLI options | Lints the client tree with the repository ESLint configuration. Run it before submitting client changes. |

### Builds and Static Checks

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm run generate:favicons` | None | Regenerates the favicon and application-icon set in `client/public/img/icons` from `client/src/assets/images/monster.png`. Use it only when the source icon or required icon outputs change. The normal build runs it automatically. |
| `npm run build` | Vite build options | Regenerates favicons and creates the production client bundle in `client/dist`. Use it for a production build and to catch bundling errors after client changes. |
| `npm run preview` | Vite preview options | Serves the built `client/dist` bundle locally with Vite Preview on port `8080`. Run `npm run build` first; use preview for a final check of production output, not as a production web server. |
| `npm run check:bootstrap-classes` | None | Scans client sources for Bootstrap classes, APIs, attributes, imports, and variables that are outside RSSMonster's supported Bootstrap subset. Use it after changing markup or styles. |
| `npm run check:bundle-size` | None | Reads the Vite manifest in `client/dist`, measures configured JavaScript and CSS bundles, and fails when a raw or gzip budget in `bundle-size-budgets.json` is exceeded. Run a build first. |
| `npm run check:hard-coded-colors` | None | Scans CSS, SCSS, and Vue style blocks for unapproved literal colors. Use it after themed UI or style changes to preserve light- and dark-mode behavior. |
| `npm run check:pwa-precache` | None | Inspects the built service worker, manifest, and output assets against the PWA caching policy and size budgets. Run a build first. |
| `npm run verify:build` | None | Runs the hard-coded-color and Bootstrap checks, builds the client, then checks bundle sizes and the PWA precache. Use it as the complete production-build verification command. |

## Server Commands

Run these commands from `server`. Server commands load the server configuration
and, unless described as tests or static checks, may connect to the configured
database. Commands marked **destructive** remove or replace stored state; back
up production data and inspect the scope before using them.

### Tests and Linting

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm test` | Vitest filters and CLI options | Runs the complete server test suite once. Use it for normal server verification and in CI. |
| `npm run test:debug` | Vitest filters and CLI options | Runs the complete suite once with `RSSMONSTER_TEST_DEBUG=true`. Use it when a test has repository-specific diagnostic logging that is hidden during a normal run. |
| `npm run test:sqlite` | Vitest filters and CLI options | Runs the SQLite-compatible configuration, model, migration, search, worker, health, smoke, and feed-observability tests. Use it for a faster check of database-sensitive behavior on SQLite; it is not the complete suite. |
| `npm run test:coverage` | Vitest filters and CLI options | Runs the complete suite once with V8 coverage enabled. Use it when evaluating server test coverage. |
| `npm run test:watch` | Vitest filters and CLI options | Starts server Vitest in interactive watch mode. Use it during local development. |
| `npm run test:semantic-report` | Vitest filters and CLI options | Runs `server/tests/semantic` and writes a concise timestamped Markdown report under `server/tests/.semantic-regression`. Use it when comparing semantic behavior or updating semantic logic. |
| `npm run test:semantic-trace` | Vitest filters and CLI options | Runs the semantic suite with `RSSMONSTER_TEST_DEBUG=true` and article-level trace reporting. Use it to diagnose why a semantic regression changed; output is intentionally verbose. |
| `npm run test:semantic-ad-event` | Vitest CLI options | Runs only the incremental advertisement/Event semantic regression test. Use it for a focused check of that scenario. |
| `npm run lint` | ESLint CLI options | Lints the server tree with the repository ESLint configuration. Run it before submitting server changes. |

### Application Processes

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm start` | None | Starts the Express application through `server/bootstrap.js`. Use it for a normal foreground server process. Production installations normally supervise this entry point with PM2. |
| `npm run start-server` | None | Alias for `npm start`; it starts the same bootstrap entry point. Use whichever name is expected by the surrounding process configuration. |
| `npm run start:worker` | None | Starts scheduled crawling. Set `PROCESSING_JOB_WORKER_ENABLED=true` only for the SQLite-compatible combined topology. Crawls run immediately and repeat after `CRAWL_WORKER_INTERVAL_MS`; see [Crawling](crawling.md). |
| `npm run start:ai-worker` | None | Starts the durable processing-job consumer used by PM2 and the MySQL Compose profile. It pauses new claims while the crawl-critical lease is active. |
| `npm run jobs:operator -- list-dead --user-id <id> [--type <type>] [--limit <1-100>]` | Existing database with processing-job migration applied | Lists a bounded dead-job set for one explicit owner without returning payloads. |
| `npm run jobs:operator -- requeue-dead --user-id <id> --job-id <uuid> [...]` | Exact dead-job IDs inspected by an operator | Requeues only the selected owner's exact dead jobs. This is manual recovery, not an automatic repair. |
| `npm run dev` | None | Starts the Express server with Node watch mode and restarts it when the configured server source paths change. Use it for normal server development. |
| `npm run debug` | None | Starts the same watched development server with the Node inspector enabled. Use it when attaching a debugger to server code. |

### Database and Crawling

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm run db` | Sequelize `db:migrate` options | Applies pending Sequelize migrations to the configured database. Use it during a controlled install or deployment. Back up production data first; this command changes the schema. |
| `npm run crawl` | None | Runs one all-user incremental crawl and semantic pipeline, then exits. It fetches due feeds, persists articles, generates vectors, updates Events and Topics, and refreshes interest scores. Use it for a one-off run or external scheduler, but do not schedule it alongside the dedicated worker. |
| `npm run crawl:recover` | `--all` | Without arguments, marks only stale running crawl records as failed so they can recover. `--all` marks every currently running crawl record as failed, including active work. Use the default for stale-run recovery; reserve `--all` for a confirmed administrative reset. |

### Semantic Maintenance

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm run semantic:repair` | `--userId=<positive-id>` | Repairs the recent semantic window, including Events, Topics, and interest scores. It targets all users by default; use `--userId` to limit work to one user. Prefer this bounded repair when a full historical rebuild is unnecessary. |
| `npm run semantic:all` | `--userId=<positive-id>`; `--batchSize=<positive-count>` (default `250`) | Rebuilds historical Event and Topic assignments and Interest Islands for all users or one user. Use it after a large import or algorithm change when recent repair is insufficient. It is substantially heavier than `semantic:repair`. |
| `npm run semantic:model-rebuild` | At least one of `--dry-run` or `--confirm`; optional `--userId=<positive-id>`; optional `--batchSize=<positive-count>` (default `100`) | **Destructive.** Resets model-dependent semantic state after an embedding-model change and rebuilds vectors for starred or clicked articles. Start with `--dry-run`; without it, the command refuses to make changes unless `--confirm` is present. If both flags are supplied, dry-run behavior takes precedence. See [Model Usage](model-usage.md#reset-and-rebuild-an-existing-environment). |
| `npm run events` | `--scope=recent-repair` (default) or `--scope=incremental`; `--userId=<positive-id>` | Runs Event assignment without Topic assignment. Use `recent-repair` to revisit the recent window or `incremental` to process only currently unassigned recent articles. It targets all users unless scoped by user ID. |
| `npm run events:backfill` | `--userId=<positive-id>`; `--batchSize=<positive-count>` (default `250`); `--skipTopicAssignment` (already supplied by the npm command) | Backfills missing Events from all historical vectorized articles without clearing existing assignments. Use it to fill historical gaps. The package script always skips Topic assignment; run `topics` separately when needed. |
| `npm run topics` | `--scope=full-rebuild` (default), `--scope=recent-repair`, or `--scope=incremental`; `--userId=<positive-id>` | Rebuilds Topic assignment for existing Events. Use the scope that matches the reconciliation context; the default is the broadest. It targets all users unless scoped by user ID. |
| `npm run islands` | None | Recalibrates Interest Islands for all users and refreshes article interest scores. Use it after relevant topic, taxonomy, or engagement changes when a full semantic rebuild is not required. |
| `npm run backfill:engaged-vectors` | `--dry-run`; `--userId=<positive-id>`; `--batchSize=<positive-count>` (default from `ENGAGED_VECTOR_BACKFILL_BATCH_SIZE`, otherwise `100`); `--limit=<positive-count>`; `--stars-and-clicks-only` | Generates missing vectors for engaged articles. By default, engagement includes stars, positive or negative feedback, and clicks; `--stars-and-clicks-only` excludes feedback-only articles. Use `--dry-run` to count the scope before calling the embedding provider. |
| `npm run taxonomy:vectors` | `--force` | Synchronizes the Interest Island taxonomy from its seed definition and generates missing or stale taxonomy vectors. `--force` regenerates vectors even when the stored vector matches. Use it after taxonomy or embedding changes; it changes taxonomy data and calls the inference service. |
| `npm run taxonomy:evaluate` | None | Embeds the checked taxonomy evaluation dataset, compares representation and model-specific instruction strategies, and prints JSON metrics. Use it for taxonomy/embedding research, not routine administration. It calls the configured embedding provider. |
| `npm run reset:semantic` | `--userId=<positive-id>`; `--dry-run` | **Destructive.** Deletes derived Events, Topics, Interest Islands, their links, and article semantic foreign keys while preserving feeds and articles. Use it only for deliberate testing, diagnosis, or a planned rebuild; inspect counts with `--dry-run` first. |

Incremental commands extend current state, repair commands revisit a bounded
window, rebuild commands recalculate broad historical state, and reset commands
remove derived state. Zero semantic results can be valid; do not use a broader
command merely because an incremental run created no assignments.

### Scoring, Seeding, and Repairs

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm run feedtrust` | None | Recalculates each feed's user-specific trust score from recent engagement, originality, consistency, volume, and negative signals. Use it after importing behavioral history or changing feed-trust logic. |
| `npm run seed:island-taxonomy` | Sequelize seed options | Applies only the `20260520104500-island-taxonomy.js` seed. Use it to create the built-in Interest Island taxonomy. This changes database data. |
| `npm run seed:undo:island-taxonomy` | Sequelize seed options | **Destructive.** Undoes only the built-in Interest Island taxonomy seed. Use it only when intentionally removing that seeded taxonomy. |
| `npm run seed:official-sources` | `--userId=<integer-id>` or `--userId <integer-id>` | Creates or updates built-in official-source rules for every user by default, or one user when specified. Use it after installing the official-source schema, adding a user that needs the defaults, or changing the built-in rules. |
| `npm run hotlinks` | None | Clears and rebuilds recent article hotlink indicators and counts. Use it to repair hotlink state after logic changes or inconsistent derived data. |
| `npm run repair-duplicates` | None | Recalculates every canonical article's `duplicateCount` from stored duplicate relationships. Use it to repair inconsistent counts; it does not perform duplicate detection itself. |

### Semantic Regression Fixtures

These commands update contributor test data under `server/tests/fixtures`.
They are not production maintenance commands. Review the resulting diff before
keeping generated fixtures, and run the inference service before a command that
generates vectors.

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm run fixture:semantic-export` | `--output=<path>`; `--user-id=<integer-id>`; `--limit=<integer-count>` | Exports categories, feeds, and suitable articles from the configured database to the main semantic regression input fixture. The default output is `server/tests/fixtures/semantic-regression.json`. Use `--user-id` to filter source rows and `--limit` to cap queried articles. This can expose source content, so inspect the fixture before committing it. |
| `npm run fixture:semantic-vectors` | None | Generates or reuses model-specific vectors for the main semantic regression fixture and selects that model's fixture set. Use it after changing the source fixture, embedding input, or embedding model. |
| `npm run fixture:semantic-incremental-vectors` | None | Generates or reuses vectors for the incremental semantic fixture. Use it after changing that fixture or embedding behavior. |
| `npm run fixture:semantic-incremental-unread-vectors` | None | Generates or reuses vectors for the incremental-unread semantic fixture. Use it after changing that fixture or embedding behavior. |
| `npm run fixture:taxonomy-vectors` | None | Generates or reuses model-specific vectors for the checked Interest Island taxonomy fixture. Use it after taxonomy, taxonomy embedding text, or embedding-model changes. |
| `npm run fixture:semantic-select` | Required `--model=<full-model-id>` | Selects a complete, already-generated model-specific vector set for the baseline, incremental, unread, and taxonomy regression fixtures. It does not generate missing vectors and fails if any required set is unavailable. |

The vector generators have no CLI options. Their batch sizes are controlled by
`SEMANTIC_REGRESSION_EMBED_BATCH_SIZE` for semantic fixtures and
`TAXONOMY_FIXTURE_EMBED_BATCH_SIZE` for the taxonomy fixture.

## Inference Commands

Run these commands from `inference`. The inference package has no
RSSMonster-specific CLI arguments; configure providers, models, credentials,
host, and port through `inference/.env`. See [Inference](inference.md) for the
full service configuration.

| Command | Arguments | What it does and when to use it |
| --- | --- | --- |
| `npm run dev` | None | Starts the inference HTTP service in Node watch mode with `INFERENCE_DEBUG=true`. Use it while developing inference routes or provider integrations. Depending on the selected provider, startup may load or download local models. |
| `npm start` | None | Starts the inference HTTP service normally. Use it for a foreground production-style process; production installations normally supervise the same entry point with PM2. |
| `npm test` | Vitest filters and CLI options | Runs the complete inference test suite once. Use it for normal verification and in CI. |
| `npm run test:watch` | Vitest filters and CLI options | Starts inference Vitest in interactive watch mode. Use it during inference development. |
| `npm run lint` | ESLint CLI options | Lints the inference tree with the repository ESLint configuration. Run it before submitting inference changes. |

Do not run multiple local inference instances for the same RSSMonster
installation. Local providers are designed to reuse one loaded model instance,
and additional processes can multiply memory usage.
