# Semantic regression reports

The semantic regression suite evaluates the complete fixture through duplicate detection, events, topics, and interest islands. Vector fixtures retain the active inference provider, model, dimensions, and embedding task when they are generated.

Run commands from `server/` (or use `npm run test:semantic-trace --prefix server`
from the repository root). Run the concise report suite with:

```bash
npm run test:semantic-report
```

Each successful run writes a timestamped, model-agnostic Markdown report to `tests/.semantic-regression/`, for example:

```text
Qwen3-Embedding-0.6B-ONNX-20260818120000.md
```

The same directory contains `trace.json` with article-level data for deeper analysis. Normal reports keep console output and Markdown manageable by summarizing events, topics, islands, duplicate groups, and incremental outcomes. To print the full article-level console trace, run:

```bash
npm run test:semantic-trace
```

Reports are generated from metadata stored in the vector fixture and do not contain provider- or model-specific branching. This allows reports from any future embedding model to use the same format.

## Model-specific vector caches

Vector generation stores a separate file for every model instead of overwriting a shared fixture. The full model ID is converted to a safe filename, for example:

```text
semantic-regression.onnx-community--Qwen3-Embedding-0.6B-ONNX.vectors.json
semantic-regression.text-embedding-3-small.vectors.json
```

Generating any fixture records the active model in `tests/.semantic-regression/active-vector-model.json`. Tests read that local selection and never contact inference to discover the active model.

To switch to a complete vector set that was generated previously:

```bash
npm run fixture:semantic-select -- --model=onnx-community/Qwen3-Embedding-0.6B-ONNX
```

The selector checks that baseline, incremental, unread, and taxonomy vectors all exist for that model. If one is missing, run its existing fixture generation command while that model is configured. Existing files for other models remain untouched.

## What the suite protects

| Area | Regression contract |
| --- | --- |
| Event identity | Same occurrence and baseline → incremental reuse; different versions, incident locations, monthly occurrences and action/object states; adversarial minimal pairs; temporal chaining; ambiguous/Eventless coverage; multilingual same occurrence. |
| Legitimate evolution | Casualty-count updates are not versions; announcement → pricing → preorder and same-day launch, corrected details, and missing version/location evidence do not falsely split the tested occurrence. |
| Event integrity | Canonical duplicate handling, unread incremental processing, article/source counts, no one-article Events, and label behavior. |
| Topic identity | Separate Events reuse durable products/projects/update series across time; unrelated similar incidents and generic subjects stay separate; ambiguous candidates remain unassigned; weak fallback stays secondary with reduced confidence. |
| Island formation | Capacity cannot force below-threshold joins; coherent behavior forms Islands, unrelated profiles remain separate/unassigned, singletons are identified, and unchanged calibration evidence is replay-safe. |
| Interest confidence | Singleton attenuation, stronger coherent support, weaker noisy support, complete Topic confidence chain, direct similarity normalized above threshold, bounded signed aggregation without correlated path stacking. |
| Explicit behavior | Positive and negative evidence survives capacity pressure without Island contamination; replay does not compound penalties; intent mismatch attenuates promotion → review transfer, including the same product. |
| Recommended | Every eligible corpus Article has a finite score; no Event/Topic/Island match remains eligible with exactly neutral interest. Positive, negative and neutral paths are distinguished; existing non-interest contributions and weights remain protected. |

`semantic-regression-incremental.json` contains natural-text Event scenarios.
`semantic-topic-gold.json` uses controlled vectors with separate dated Events for
versions, project lifecycle, product evolution, recurring security updates,
incident separation, generic separation, long-running continuity and mixed-case
subjects. `semanticRegression.topicGold.test.js` adds ambiguity, seed contamination,
vector-key collision and label-independence checks. Controlled vectors test the
policy independently of embedding behavior; they are not a model-quality benchmark.

`semanticRegression.interestConfidence.test.js` and
`semanticRegression.behavioralIntent.test.js` distinguish training/behavioral
Articles from held-out recommendations. The held-out Article must not participate
in Island formation before scoring. Seed similarity 1.0 is explicitly self evidence,
not proof of generalization. Negative fallback tests use explicit dislikes, never
unread state, missing clicks or short reads as inferred negatives.

## Reading reports and diagnostics

Inspect the trace, not only Vitest's final status. Generated artifacts include:

- the timestamped model report and `trace.json` for the main corpus;
- Event `*-decisions.md` / `*-decisions.json` companions for assignment evidence;
- `topic-gold.md` for controlled Topic outcomes.

[Event diagnostics](../../services/events/README.md#event-decision-diagnostics)
show candidate ID/name, semantic/headline similarity, temporal/span compatibility,
shared-entity count, version/location/action/object match/conflict flags, scores,
decision and reason codes. An eligible candidate is not necessarily the selected
or committed Event; inspect ambiguity and the locked `commit_check` too.

[Topic diagnostics](../../services/topics/README.md#diagnostics-and-regression-contract)
show candidate rank, threshold results, durable entity overlap, member count,
identity fallback, confidence, relationship type and winner margin. Assignment
summaries distinguish strong/secondary/weak-fallback reuse, new Topics and
ambiguous/unassigned decisions. Candidate output is bounded; omitted candidates
are counted. These are decisions from the run, not a complete persisted history.

[Island/interest diagnostics](../../services/islands/README.md#trace-fields-and-limitations)
show preference strength, derived Island confidence and support/cohesion, selected
match path, normalized relationship confidence and signed contribution. Topic
paths expose both relationship confidences; explicit fallback includes source
Article, sign, similarity, publication-recency factor, source/target intent and
compatibility. Intent categories in output are same-intent,
cross-intent-attenuated and missing-intent. Bodies and vectors are not included in
these decision diagnostics.

Compare Recommended coverage separately from personalization coverage:

- eligible Articles and finite Recommended scores (100% required for the normal corpus);
- positive, negative and zero/neutral interest;
- Topic, direct Island and explicit behavioral paths;
- singleton-derived and seed/self matches;
- held-out positive, negative and neutral Articles;
- active/singleton/low-cohesion Islands and unassigned behavioral profiles;
- Topic membership, single-Event Topics, and ambiguous/unassigned cases.

Path counts need not sum to article counts: opposite-sign paths can both survive
for one Article. Main-corpus held-out status means no recorded behavioral evidence;
controlled tests additionally enforce training/test separation. Broad labels and
unexpected high similarities still warrant inspection even when assertions pass.
More nonzero interest is not inherently better.

## Test safety and maintenance

The Vitest setup uses an isolated test database and resets test state. Do not point
it at production or run multiple database-resetting test processes concurrently.
The suite reads selected cached embeddings, not live model calls. Missing vector
fixtures can skip model-backed cases: check skips before claiming full validation.
Generation/selection commands are separate from running tests; do not silently
regenerate vectors, weaken thresholds, or remove new expectations to turn failures
green. Investigate fixture design, assertions, embedding variation, timestamps,
candidate retrieval and policy decisions first.

Assert same/different membership using fixture source keys and observed records.
Event and Topic IDs are diagnostic only and must never be hardcoded as expected
identities. Keep the [Event](../../services/events/README.md),
[Topic](../../services/topics/README.md), and
[Island](../../services/islands/README.md) contracts synchronized with behavior.

## Expanded diversity corpus

`semantic-regression-expansion.json` adds 226 natural-text Articles in 43 small
scenarios. Its frozen Qwen vectors are checked in as
`semantic-regression-expansion.vectors.json`; input hashes bind them to the exact
production embedding-text preparation. Existing fixture rows and expectations
are unchanged. The expansion runs before the timestamped main report.

The legacy user still has 778 Articles. Expansion users add 226, bringing those
two explicitly measured corpora to 1,004 stored Articles. Older isolated occurrence,
Topic and confidence test records are additional and are not hidden in that total.
The split is deliberate: the legacy loader compresses dates into six days, while
expansion scenarios preserve real calendar gaps and controlled user interests.
There are 24 behavioral training Articles and 40 explicitly held-out Articles.
Held-out rows are inserted only after Island formation. News/Topic scenarios have
no behavioral training; do not confuse all nonbehavioral news with the explicit
40-Article recommendation evaluation set.

Coverage includes version/model/CVE and location minimal pairs, launch versus
recall, phone versus tablet, numeric updates, causal follow-ups, time-window edges,
monthly/product/project/sports continuity, unrelated incident subjects, ambiguous
Topics, English/Dutch/German/French reporting, and syndication versus independent
coverage. Content includes short/missing bodies, repeated titles, punctuation,
technical guides, reviews, promotions and longer independent reporting. Scenario,
wave, role and expected relationships live in regression metadata, not headline
markers.

Topic-only gold deliberately supplies separate corroborated Events so Topic
identity is tested independently from Event formation. Each occurrence is inserted
and assigned at its own publication clock; future-wave Articles are absent.
Ambiguity cases establish two existing Topics before submitting a bridging Event. Natural vectors and an
equal-confidence policy probe are reported separately. Island tests combine frozen
Qwen end-to-end scoring with controlled geometry that isolates support, Topic-path
confidence, intent and aggregation on the same held-out Articles. Controlled
vectors are never represented as Qwen output or added to the corpus count.

The capacity scenario uses a three-community test limit to reserve existing memory
for strongly supported positive interests, leaving explicit preferences outside it.
A separate controlled eleven-profile probe exercises the default ten-community
limit and verifies that each unrelated profile remains separate or unassigned.
No production threshold, capacity default or Recommended weight changes.

`expansion-report.md` and `expansion-report.json` separate legacy/expansion counts,
canonical Recommended eligibility, actual natural-vector scores, controlled
held-out paths, isolated unassigned-source transfer probes and every gold
assertion's PASS/FAIL. `expansion-decisions.md` / `.json` and
`expansion-topic-decisions.json` provide candidate diagnostics. An isolated transfer
probe tests one unassigned preference; its score need not equal the final aggregate
when the user has another positive or negative interest in that subject. Required unassigned-source probes are declared with
`regression.expectedEvidence`; losing that source fails the assertion instead of
silently dropping the probe. All 21 declared natural transfer cases must execute.

For expansion fixtures, effectively neutral transfer permits absolute interest
up to 0.005; meaningful negative transfer is below -0.025. These test expectations
are not new production gates. Failed natural-language gold expectations remain
ordinary failing tests with diagnostic classifications; they are not skipped or
marked as expected failures. A frozen cross-language similarity below retrieval
threshold is reported under embedding instability/coverage, not proof that the
cached vector changed randomly. Inspect downstream missing Topics separately from
the upstream failure to form their Event.

Run the focused expansion from `server/` with:

```bash
npm exec -- vitest run tests/semantic/semanticRegression.expansion.test.js
```

For deliberate fixture maintenance only, with inference dependencies and the
cached Qwen model already installed:

```bash
node tests/helpers/generateSemanticExpansionVectors.js
```

This reuses the repository's local Qwen provider, prohibits model downloads,
reuses unchanged input hashes and checkpoints newly generated embeddings. It
requires the normal server environment for imports but performs no database
writes. Normal semantic tests never run it or contact inference. Compare timed
full `npm run test:semantic-trace` runs before and after corpus changes; do not
weaken gold assertions to improve runtime or pass rate.
