> Historical fixture notes: the independent semanticGold tests described below have been removed. Occurrence articles remain in the two-batch semantic regression corpus.

> Occurrence articles now live in `semantic-regression-batch001.json` and `semantic-regression-batch002.json`. Focused gold tests derive the original dated subsets from their provenance metadata. Vector caches are generated and ignored.

# Incremental Event occurrence fixtures

The `regression` field on an article is test-only metadata: `scenario` selects its
isolated user, `group` identifies an occurrence, and `wave` orders ingestion.
`sourceId` and `url` identify reports without changing embedded title/body text.
The original two Orion baseline reports and 67 incremental occurrence reports
are retained in the two canonical batches. Focused tests restore their original
source order, feed mapping and chronology from metadata.

Both batches use frozen Qwen vectors (1024 dimensions). The focused occurrence
view derives vectors from the batch caches; no standalone occurrence cache is
required. `loadIncrementalFixture({ occurrences: true })` selects this view. Each
scenario has its own test user, preventing comparisons between vector models or
unrelated scenario data. These tests exercise Event assignment independently of personal-interest affinity.

The test freezes **Date only**, advancing to each wave's publication time; real
I/O timers keep running. It inserts unchanged publication times using the
existing insertion helper's `preservePublishedAt` option and invokes the real
incremental Event pipeline. A month stays a month, and the chain retains its two
14-hour gaps. The Orion case snapshots its two-report baseline Event **before**
inserting later launch reports, prices, and pre-orders, then checks that every
wave retains that captured ID. Nothing manually seeds Event membership.

| Coverage | Expected |
| --- | --- |
| Orion launch: four sources, varied wording | One Event |
| Pricing and pre-orders within 22.5 hours | Join captured baseline Event; six articles, four sources |
| Orion OS 4.2 and 4.3, same day | Two internally corroborated Events |
| August and September security releases | Two Events, three sources each |
| Project Nova launch and cancellation weeks apart | Two Events |
| Rotterdam and Antwerp collisions, same morning | Two Events |
| Ferry closure at 0, 14, and 28 hours | A/B together; C Eventless; complete span below configured limit |
| Vague Nova report after tablet and camera announcements | Two Events must already exist; vague report stays Eventless |
| Lyra price cut and new model launch, same day | Two Events |
| English/Dutch Amsterdam laboratory opening | One Event; frozen cosine approximately 0.9065 |

The vague Nova article has similar but insufficient semantic evidence for both
product Events (member cosine approximately 0.75–0.77). It tests refusal to force
an under-specified report into either existing Event; it does not claim to test
the winner-margin tie breaker between two eligible candidates.

The suite verifies complete stored membership counts, distinct feed counts, and
absence of singleton Events. Newly exposed desired-behavior failures remain
ordinary failing tests, never skips or expected failures. Initial validation
exposed false merges for versions, locations, and price cut versus launch. All
other occurrence relationships passed, including baseline reuse and multilingual
coverage. Production matching logic is unchanged by this fixture task.

Run from `server/`:

```sh
npm test -- tests/semantic tests/helpers/semanticRegressionHelpers.test.js
npm run lint
```

The independent occurrence suite works without generating the legacy vector
corpus or contacting inference. It writes a compact expected/actual report to
`server/tests/.semantic-regression/occurrences.md`, including memberships even
when relationship assertions fail. The normal Vitest output names failed cases.

To deliberately regenerate **only** these frozen vectors using the local
inference service:

```sh
npm run fixture:semantic-vectors
```

This uses the production embedding-text builder with title, description and plain
body, records input/content hashes and model metadata, and does not change the
active model selection or database data. Tests reject missing, stale, non-finite,
or dimensionally inconsistent vectors. Regeneration changes the semantic input
to the tests: inspect changed results and retain the expected relationships.
