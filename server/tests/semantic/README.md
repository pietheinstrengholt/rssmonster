# Semantic regression: two batches

Run from `server/`:

```bash
npm run test:semantic-trace
# Same simulation with less console output:
npm run test:semantic-report
```

The simulation has exactly two article inputs:

- [Batch001](../fixtures/semantic-regression-batch001.json): exactly 1,000 articles.
- [Batch002](../fixtures/semantic-regression-batch002.json): exactly 1,000 articles.

One test owns the sequence: load Batch001, run Event assignment and Topic
assignment, calibrate Islands and score; then load Batch002 for the **same user**,
run incremental Event and Topic assignment, calibrate Islands and score again.
There is no semantic reset, third unread load, separate expansion load, or
auxiliary user in this command. The production incremental scope performs Event
then Topic work; Island calibration includes confidence-aware interest scoring.
Thresholds, community limits, models and Recommended weights are unchanged.

## Runner and test database

Both commands above select only
[`semanticRegression.batches.test.js`](semanticRegression.batches.test.js).
They do not run every test under `tests/`, or the separate gold suite.
[`vitest.config.js`](../../vitest.config.js) disables parallel test files and
[`globalSetup.js`](../setup/globalSetup.js) resets the configured test database
**before each Vitest invocation**. The test setup selects `rssmonstertest`; use
the test database configuration, never a production database. Run database suites
sequentially. There is one reset before the simulation and none between its batches.

| Step | What happens |
| --- | --- |
| Setup | Load frozen taxonomy vectors and create one test user. Taxonomy records are not additional articles. |
| Batch001 load | Insert 1,000 articles, preserving fixture publication times, behavior and cached article vectors. |
| Batch001 processing | `runIncrementalEventsForUser` assigns Events and Topics; `runIslandCalibrationForUser` builds/enriches Islands and scores unread articles. |
| Initial snapshot | Compute runtime Recommended scores for all 1,000 articles and collect membership, interest-path and Island diagnostics. |
| Batch002 load | Insert the next 1,000 articles into the same user's existing semantic state. |
| Batch002 processing | Run incremental Event/Topic assignment. Score held-out arrivals before applying their optional feedback; then calibrate Islands and score again. |
| Final snapshot | Validate 2,000 articles and Recommended scores, existing Event membership, Event/Topic reuse and increased behavioral support in an existing Island. |

The runner uses the production services, not fixture Event/Topic/Island IDs or
preassigned memberships. It has a 600-second test timeout. Diagnostics can derive
profiles and explain matches without performing another persisted calibration.
The final snapshot is cumulative: Batch002 metrics describe all 2,000 articles;
its `newEvents`, `reusedEvents` and similar fields describe the second pass.

## Corpus and chronology

Publication timestamps cover September 7–13, 2026, within one simulated week.
Batch001 occupies hours 0–149; Batch002 occupies hours 150–167. A mocked Date clock
advances to just after the last publication in each batch. Real timers continue
running so reported durations measure actual runtime. These are simulation dates,
not assertions about when the real-world events happened.

The consolidation retains all controlled occurrence/expansion/longitudinal rows,
the former unread probe, and all 250 frozen real background articles. It replaces
227 older neutral, unlabelled background rows to keep the total at exactly 2,000.
Feed IDs are remapped without collisions; article text is preserved. Original
publication dates, origin fixture and source IDs remain in regression metadata
for provenance and focused gold tests. Corpus names in that metadata are historical
identifiers, not additional files to load.

Both batches include favorites, clicks and explicit dislikes. The 160 held-out
articles arrive in Batch002 with no behavior. They are scored against existing
memory before their optional feedback is applied and before the second Island
calibration. Two F1 held-out articles receive favorite/click feedback after their
probe scores, and the suite asserts that at least one existing Island gains
behavioral members. This tests an initial state and one evolution step; it does not claim
to simulate four successive feedback/calibration waves.

The suite checks exactly 2,000 stored articles and finite Recommended scores for
all 2,000. A trustworthy interest match is optional: unmatched interest is zero.
Recommended is a runtime calculation, not a persisted Article score column.
The simulation starts at semantic processing, after ingestion; it does not run a
separate duplicate-marking pass. Duplicate exclusion and syndicated-support rules
remain covered by the focused duplicate/gold tests. Do not reinterpret duplicate
rows as additional independent support in production.

A one-week chronology increases candidate competition, but cannot prove
months-long temporal separation or dormant Topic reuse. Focused gold subsets
restore their original timestamps for those contracts. Event identity remains
occurrence-based; Topics represent durable subjects. Generated labels are not
independent identity evidence. See [semantic architecture](../../services/README.md).

## Reports

Generated, ignored artifacts in `tests/.semantic-regression/`:

- `batch-report.md`: initial/final metrics and runtime.
- `batch-results.json`: per-article scores and paths, Event/Topic membership,
  Island confidence diagnostics, persistence outcomes, held-out probes and timings.
- `batches-decisions.json` / `.md`: bounded Event candidate diagnostics and reason
  codes. Topic decision diagnostics are included in `batch-results.json`.

Compare distinct Events/Topics reused with articles joining existing Events;
these are different counts. Island persistence outcomes expose creation, updates,
merging and retirement where the calibration actually performs them. No Island
merge is forced merely to produce a desired report count.

Recommended coverage and personalization coverage are separate. Inspect positive,
negative and neutral scores, direct Island/Topic/behavioral paths, singleton
confidence and held-out versus seed evidence. A passing coverage simulation is
not proof that every Event/Topic gold relationship is correct.

## Focused semantic gold

`npm run test:semantic-gold` runs the independent Event, Topic, Island, behavioral
intent, confidence and recommendation gold tests in `tests/semanticGold/`.
Those tests intentionally create isolated users and controlled vectors where
appropriate; they are **not** additional batches of the shared simulation.
They read occurrence/expansion subsets from the two canonical article files through
`semanticBatchFixtures.js`, restoring original chronology without a third corpus.
Known model/policy gold failures must remain visible, not be weakened for coverage.

The gold suite does **not** simply rerun all 2,000 articles:

| Gold tests | Article/evidence source |
| --- | --- |
| Occurrence identity, expansion and advertising/duplicate cases | Selected batch articles, copied into isolated test users; original source order, feed mapping and dates are restored where needed. |
| Topic policy cases | [`semantic-topic-gold.json`](../fixtures/semantic-topic-gold.json) supplies controlled subjects/vectors; tests construct isolated model records. |
| Island quality, interest confidence and behavioral intent | Small additional articles and controlled vectors constructed directly in the tests. |
| Longitudinal report review | Reads the latest batch results and canonical fixture metadata; creates no additional articles. |

Thus a separate gold invocation may create extra test articles. These never join
the 2,000-article trace simulation. Gold asserts exact relationships and scoring
properties; the shared simulation checks integration, continuity and coverage.
Neither test type alone measures real-user ranking quality.

`semanticRegression.longitudinal.test.js` in that directory is a report-only gold
review of the latest `batch-results.json`; run it explicitly after the simulation
when investigating shared-corpus relationships. It adds no articles. Its strict
relationship expectations may expose failures in the compressed timeline.

Run that optional review with:

```bash
npx vitest run tests/semanticGold/semanticRegression.longitudinal.test.js
```

It is excluded from `test:semantic-gold`, requires a successful current batch
report, and checks its fixture digest. It writes `batch-gold-results.json`.
Although the review itself adds no articles, the normal Vitest global setup still
resets the test database. Preserve reports first and rerun the trace if you need
the populated simulation database afterwards.

Use held-out articles to assess generalization. Never hardcode runtime Event,
Topic or Island IDs. Replay safety, no forced below-threshold Island joins,
singleton attenuation, intent-sensitive explicit negative evidence and bounded
path aggregation remain independent focused regression contracts.

## Local vector caches

All `*.vectors.json` files are generated and ignored, including the formerly
tracked occurrence and expansion caches. Tests do not call inference and fail
clearly when a required batch or taxonomy cache is missing.

```bash
npm run fixture:semantic-vectors
npm run fixture:taxonomy-vectors
npm run fixture:semantic-select -- --model=onnx-community/Qwen3-Embedding-0.6B-ONNX
```

The batch generator uses the locally installed Qwen provider/model cache and
writes one model-qualified vector cache per batch. The selector validates both
batch caches plus taxonomy. Gold subset caches are derived from these same two
batch caches; separate occurrence/expansion vector files are no longer required.
Do not commit generated vectors or model-selection state. Run database-resetting
Vitest commands sequentially, then rerun the simulation if its final 2,000-row
test database state is needed for inspection.

## Required before/after workflow for semantic changes

Every semantic architecture or behavior change requires a fresh
`npm run test:semantic-trace` **before implementation and after the final change**,
followed by an explicit comparison. This includes Event/Topic assignment, Island
formation/calibration, embeddings or semantic input preparation, confidence,
behavioral fallback, Recommended scoring, semantic eligibility, configuration,
and changes to fixtures/loaders/assertions that affect this simulation.
Documentation-only clarification does not change semantic behavior; verify its
commands and descriptions against code instead of claiming a new semantic run.

1. Read this guide and the affected service README. Run the baseline against the
   current working tree, preserving any existing user changes. Record pre-existing
   failures before editing; a failed baseline is still evidence.
2. Save the trace log, exit status, reports, fixture fingerprints, selected model
   and vector-cache fingerprints. The runner deletes/replaces `batch-results.json`
   and `batch-report.md`, so keeping only the live report directory loses the baseline.
3. Implement the change and run focused tests, the relevant gold tests and lint.
   Run `test:semantic-gold` for identity, Island, confidence or behavioral-scoring
   changes. Capture baseline gold failures too when comparing those contracts.
4. Rerun the trace after the final behavioral change. Preserve the same artifacts
   separately. Keep input articles, dates, feedback, model and vectors identical
   unless changing one of them is explicitly part of the task; disclose any such
   difference rather than attributing all metric changes to production code.
5. Inspect candidate decisions and representative articles as well as the totals.
   Report before, after, delta, intended changes, unexpected changes, existing/new
   failures and limitations. A passing trace is not a substitute for this review.

One way to capture runs from `server/`, in the same Bash session:

```bash
comparison_dir="tests/.semantic-regression/comparisons/$(date -u +%Y%m%dT%H%M%SZ)"
capture_semantic_trace() {
  local output="$comparison_dir/$1"
  local result=0
  mkdir -p "$output"
  git rev-parse HEAD > "$output/commit.txt"
  git diff --stat > "$output/working-tree.txt"
  sha256sum tests/fixtures/semantic-regression-batch00{1,2}.json > "$output/fixtures.sha256"
  sha256sum tests/fixtures/semantic-regression-batch00*.vectors.json tests/fixtures/island-taxonomy*.vectors.json > "$output/vectors.sha256"
  if [ -f tests/.semantic-regression/active-vector-model.json ]; then
    cp tests/.semantic-regression/active-vector-model.json "$output/"
  fi
  touch "$output/started"
  npm run test:semantic-trace > "$output/trace.log" 2>&1 || result=$?
  printf '%s\n' "$result" > "$output/exit-status.txt"
  for artifact in batch-results.json batch-report.md batches-decisions.json batches-decisions.md; do
    if [ "tests/.semantic-regression/$artifact" -nt "$output/started" ]; then
      cp "tests/.semantic-regression/$artifact" "$output/"
    fi
  done
  return "$result"
}
capture_semantic_trace before
# Implement and validate the change, then:
capture_semantic_trace after
```

The capture preserves the actual npm exit status and copies only newly written
reports. On failure, reports may be absent or incomplete; inspect `trace.log` and
never substitute an older successful report. All comparisons remain under the
ignored report directory. Record Node/npm versions and relevant non-secret
configuration differences when comparing across environments; do not dump `.env`
files or credentials into reports. This is an agent/developer workflow, not an
automatic filesystem watcher or a newly added CI hook.

### What to compare

Compare each initial snapshot and each cumulative final snapshot separately:

| Dimension | Required evidence |
| --- | --- |
| Coverage | Input/stored/eligible/scored counts, finite Recommended coverage and neutral unmatched interest. Preserve 1,000 + 1,000 and 100% coverage. |
| Events | Counts, Eventless articles, distinct new/reused Events, articles joining existing Events, stable initial membership, false merges/splits and reason codes. |
| Topics | Counts, distinct reuse, unassigned/ambiguous cases, single-Event Topics, confidence, durable continuity and suspicious relationships. `newTopics` in the batch report is net count growth. |
| Islands | Active/singleton counts, unassigned profiles, created/updated/archived outcomes, member support growth, cohesion and confidence. Report actual merges only when demonstrated. |
| Interest | Positive/negative/neutral counts, direct/Topic/behavioral paths, contribution ranges and intent attenuation. More non-zero scores are not automatically better. |
| Held-out behavior | The explicit `heldOut` array's pre-feedback positive/negative/neutral results and paths, separately from seed/self matches and final post-feedback scores. Broad snapshot “Held-out” metrics mean non-self matches and are not identical to the 160 designated probes. |
| Runtime and tests | Per-phase/total processing time, Vitest wall time, exit status, gold/focused failures and skips. Startup/reset time is outside the report's processing timings. |

Match articles across runs by stable fixture `sourceId`/URL and scenarios, not
runtime database IDs. IDs in diagnostics identify relationships within a run.
For changed cases, include titles and the relevant Event/Topic/interest decision
evidence. Distinguish fixture/timestamp problems, embedding differences and
implementation defects. Do not lower thresholds, force Island membership, retune
Recommended weights, or weaken gold expectations merely to restore previous totals.
If the baseline or after run cannot execute, state the blocker and the missing
comparison explicitly; do not present historical numbers as a freshly measured baseline.
