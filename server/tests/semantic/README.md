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

One test owns the sequence: load Batch001, run Event assignment, calibrate Islands and score; then load Batch002 for the **same user**,
run incremental Event assignment, calibrate Islands and score again.
There is no semantic reset, third unread load, separate expansion load, or
auxiliary user in this command. The production incremental scope performs Event
work; Island calibration includes confidence-aware interest scoring.
Thresholds, community limits, models and Recommended weights are unchanged.

## Runner and test database

Both commands above select only
[`semanticRegression.batches.test.js`](semanticRegression.batches.test.js).
They do not run every test under `tests/`.
[`vitest.config.js`](../../vitest.config.js) disables parallel test files and
[`globalSetup.js`](../setup/globalSetup.js) resets the configured test database
**before each Vitest invocation**. The test setup selects `rssmonstertest`; use
the test database configuration, never a production database. Run database suites
sequentially. There is one reset before the simulation and none between its batches.

| Step | What happens |
| --- | --- |
| Setup | Load frozen taxonomy vectors and create one test user. Taxonomy records are not additional articles. |
| Batch001 load | Insert 1,000 articles, preserving fixture publication times, behavior and cached article vectors. |
| Batch001 processing | `runIncrementalEventsForUser` assigns Events; `runIslandCalibrationForUser` builds/enriches Islands and scores unread articles. |
| Initial snapshot | Compute runtime Recommended scores for all 1,000 articles and collect membership, interest-path and Island diagnostics. |
| Batch002 load | Insert the next 1,000 articles into the same user's existing semantic state. |
| Batch002 processing | Run incremental Event assignment. Score held-out arrivals before applying their optional feedback; then calibrate Islands and score again. |
| Final snapshot | Validate 2,000 articles and Recommended scores, existing Event membership, Event reuse and increased behavioral support in an existing Island. |

The runner uses the production services, not fixture Event/Island IDs or
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
for provenance. Corpus names in that metadata are historical
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
remain covered by the focused duplicate tests. Do not reinterpret duplicate
rows as additional independent support in production.

A one-week chronology increases candidate competition, but cannot prove
months-long temporal separation or dormant interest recovery. Original timestamps remain available in provenance metadata. Event identity remains
occurrence-based; Islands represent user-specific preferences. Generated labels are not
independent identity evidence. See [semantic architecture](../../services/README.md).

## Reports

Generated, ignored artifacts in `tests/.semantic-regression/`:

- `batch-report.md`: initial/final metrics and runtime.
- `batch-results.json`: per-article scores and paths, Event membership,
  Island confidence diagnostics, persistence outcomes, held-out probes and timings.
- `batches-decisions.json` / `.md`: bounded Event candidate diagnostics and reason
  codes.

Compare distinct Events reused with articles joining existing Events;
these are different counts. Island persistence outcomes expose creation, updates,
merging and retirement where the calibration actually performs them. No Island
merge is forced merely to produce a desired report count.

Recommended coverage and personalization coverage are separate. Inspect positive,
negative and neutral scores, direct Island/behavioral paths, singleton
confidence and held-out versus seed evidence. A passing coverage simulation is
not proof that every expected Event relationship is correct.

## Focused service tests

The semanticGold suite and its npm commands have been removed. The two-batch
simulation remains available through `test:semantic-trace` and
`test:semantic-report`. Use the existing Event, Island, duplicate, and
recommendation service tests for focused validation alongside the simulation.
Historical gold reports describe the removed suite, not current test commands.

Use held-out articles to assess generalization. Never hardcode runtime Event or
Island IDs. Preserve replay safety, no forced below-threshold Island joins,
singleton attenuation, intent-sensitive explicit negative evidence, and bounded
path aggregation in focused regression coverage.

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
batch caches plus taxonomy; separate occurrence/expansion vector files are not required.
Do not commit generated vectors or model-selection state. Run database-resetting
Vitest commands sequentially, then rerun the simulation if its final 2,000-row
test database state is needed for inspection.

## Required before/after workflow for semantic changes

Every semantic architecture or behavior change requires a fresh
`npm run test:semantic-trace` **before implementation and after the final change**,
followed by an explicit comparison. This includes Event assignment, Island
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
3. Implement the change and run the relevant focused service tests and lint.
   Capture baseline failures too when comparing those contracts.
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
| Islands | Active/singleton counts, unassigned profiles, created/updated/archived outcomes, member support growth, cohesion and confidence. Report actual merges only when demonstrated. |
| Interest | Positive/negative/neutral counts, direct/behavioral paths, contribution ranges and intent attenuation. More non-zero scores are not automatically better. |
| Held-out behavior | The explicit `heldOut` array's pre-feedback positive/negative/neutral results and paths, separately from seed/self matches and final post-feedback scores. Broad snapshot “Held-out” metrics mean non-self matches and are not identical to the 160 designated probes. |
| Runtime and tests | Per-phase/total processing time, Vitest wall time, exit status, focused test failures and skips. Startup/reset time is outside the report's processing timings. |

Match articles across runs by stable fixture `sourceId`/URL and scenarios, not
runtime database IDs. IDs in diagnostics identify relationships within a run.
For changed cases, include titles and the relevant Event/interest decision
evidence. Distinguish fixture/timestamp problems, embedding differences and
implementation defects. Do not lower thresholds, force Island membership, retune
Recommended weights, or weaken regression expectations merely to restore previous totals.
If the baseline or after run cannot execute, state the blocker and the missing
comparison explicitly; do not present historical numbers as a freshly measured baseline.
