# Active Interest Island capacity validation

Implemented on `topic-removal`, preserving the existing outstanding work. No Event,
decay, behavioral-weight, similarity-threshold or Recommended-weight changes.

## Contract and implementation

The old `parseInt(process.env.MAX_INTEREST_ISLANDS, 20)` used radix 20: configured
`20` became 40 and `30` became 60. The fallback was separately 20. The setting
also bounded only formation, while retained unmatched Islands could accumulate
beyond that bound; the previous persistence summary counted only processed profiles.

It now means **maximum simultaneously active persisted Islands per user**, default
20. Strict decimal integers 1–1000 are accepted; missing, invalid, partial,
non-integer, zero, negative, non-finite and larger values fall back to 20. Internal
options can lower, never exceed, the configured maximum.

Persistence enforces the cap after matching, reactivation, creation, lifecycle
archival and name handling. Candidates rank lexicographically by absolute current
reconstructed profile weight, lifecycle confidence rounded to four decimals,
qualifying support count, latest meaningful interaction, then ascending stable ID.
The existing weight formula already rounds to four decimals. Matched profiles use
their Article IDs; unmatched candidates reuse nearest-support reconstruction.
Stored obsolete weights and signed direction cannot independently win capacity.

Overflow archives; history, IDs and audit records are not deleted. New and
reactivated candidates compete under the same rule. Matching archived Islands
precedes creation; normal reactivation still requires sufficiently strong new
behavior after archival. Losing candidates stay dormant. The per-user transaction
lock, with SQLite immediate transactions, prevents concurrent persistence from
creating duplicate winners or exceeding the cap. Enforcement applies when a user
calibrates; this task does not migrate every user's existing rows or add a database
constraint.

Formation keeps its existing bounded magnitude/ID-ordered pass using the same
numerical limit. This preserves clustering and bounded work; it is not the active
cap enforcement and does not optimize globally across every unassigned community.
See [the complete contract](interest-islands.md#active-capacity).

## Tests

- **194 tests passed / 26 files**: Islands, configuration, refresh/replay, explicit
  feedback, recommendations and the forgetting evaluation (63.09 s).
- Final strengthened MySQL capacity suite: **6 passed** (33.89 s), including
  concurrent creation without duplicate Islands.
- Final SQLite configuration/capacity/lifecycle/refresh run: **37 passed / 4 files**
  (8.89 s), including the same concurrency test.
- Server ESLint and `git diff --check` passed.
- Before and after semantic traces both passed. No regression assertions were
  weakened; both batches now additionally assert the configured active maximum.

New coverage includes decimal/fallback/bounded parsing; 25 existing qualifying
Islands becoming 20 active; creation at capacity; strong archived negative
reactivation with preserved ID/audit; a weaker return remaining dormant; 15→16
below capacity; stable replay/archive times; multi-user isolation; and serialized
concurrent creation. No client or schema changes required build/migration tests.
These are focused checks, not a claim that the entire repository test suite ran.

## Before/after semantic results

Same corpus, cached vectors and selected model; fingerprints match. Batch001 is
unchanged: 1,000 Articles, 20 active Islands, 74 unassigned profiles, 43 positive,
6 negative, 951 neutral and 100% Recommended coverage. All scores and ranks match.

| Cumulative Batch002 metric | Before | After |
| --- | ---: | ---: |
| Articles / Recommended coverage | 2,000 / 100% | 2,000 / 100% |
| Active Islands | 25 | 20 |
| Historical Islands retained | 25 | 25 |
| Capacity archives this pass | 0 | 5 |
| Active singleton Islands | 10 | 9 |
| Unassigned behavioral profiles | 114 | 114 |
| Positive-interest Articles | 169 | 167 |
| Negative-interest Articles | 42 | 45 |
| Neutral-interest Articles | 1,789 | 1,788 |
| Events / Eventless Articles | 315 / 864 | 315 / 864 |

Event memberships, Event records and reuse statistics are identical in both
phases. Formation's assigned/unassigned counts are unchanged. The five capacity
archives are Formula 1, Infrastructure as Code, Nintendo Switch (negative),
Photography (2), and Gaming Keyboards. These are existing run IDs 17, 19, 20, 24,
25 in the preserved diagnostic artifacts, not IDs hardcoded in production.
The retained Island 9 gains one nearest-support Article (1→2); its confidence
changes 0.348716→0.342725. This is existing support reassignment after an archive,
not a confidence-formula change. All other surviving Island diagnostics match.

All **160 arrival-time held-out scores** match exactly. At that probe, 60/60
positive-labeled candidates remain positive, 23/23 negative-labeled candidates
remain negative, and 24/24 neutral-labeled candidates remain neutral.

At the **final recalibrated state**, 57/60 positive-labeled candidates remain
positive; three keyboard candidates become negative. Negative-label retention
remains 23/23 and neutral false positives remain **0/24**. Thus a passing trace is
not a claim of identical final preference outcomes. The changed cases are:

| Source ID suffix (`long-changing-preference-incremental-`) | Before interest | After interest |
| --- | ---: | ---: |
| 307 | 0.3493 | −0.0206 |
| 308 | 0.3626 | −0.0296 |
| 310 | 0.3816 | −0.0226 |

Their archived Gaming Keyboards Island previously contributed roughly
0.459–0.498. Existing positive fallback now contributes 0.083–0.094, while existing
negative fallback remains −0.109 to −0.116. The net sign changes accordingly.
This is a documented capacity tradeoff; no cap, weights, intent handling or
fixture expectations were tuned to avoid it. One other Article changes from
neutral to +0.0017; it is outside the 24 explicitly neutral-labeled probes, so
no broader corpus-wide false-positive claim is made.

49 of 2,000 Article interest/Recommended values change, including four sign
changes. The strongest positive/negative scores are unchanged. Recommended
score distribution:

| Statistic | Before | After |
| --- | ---: | ---: |
| Minimum | 0.017596 | 0.017596 |
| 25th percentile | 0.173882 | 0.172778 |
| Median | 0.275715 | 0.275204 |
| 75th percentile | 0.334908 | 0.333010 |
| 95th percentile | 0.369945 | 0.367186 |
| Maximum | 0.677222 | 0.677222 |
| Mean | 0.260792 | 0.257886 |

Fixed diagnostic pool: sort all 2,000 reported Articles by Recommended, then
fixture source ID. Top-20 overlap is 16/20; 1,803 positions move, including many
unchanged-score Articles displaced by others; maximum movement is 1,299 places.
This includes read Articles and is a diagnostic comparison, not a production
unread-page ranking or a relevance-quality metric. The runner has no adjudicated
NDCG/precision metric, so none is claimed.

Processing runtime: **152.37→120.09 s**; Vitest wall duration: **175.61→141.43 s**.
These single runs are not a controlled performance benchmark. There were no
baseline or final trace test failures.

## Artifacts and files

Ignored reproducible captures are in
`server/tests/.semantic-regression/comparisons/island-capacity/`: before/after
logs, exit statuses, fingerprints, model metadata, batch reports, decision traces,
focused test/lint logs, `compare.py` and `comparison.json`. The comparison includes
all 49 changed Articles' old/new interest paths, scores and ranks. Run
`python3 server/tests/.semantic-regression/comparisons/island-capacity/compare.py`
to regenerate the comparison from retained reports.

Files changed in this task (earlier pending edits were preserved):

- `server/services/islands/islandVectorUtils.js`: decimal capacity parsing/resolution.
- `server/services/islands/islandArticleProfiles.js`: shared weight calculation;
  formation respects the resolved bound.
- `server/services/islands/islandCapacity.js`: current-evidence capacity ordering.
- `server/services/islands/islandPersistence.js`: archive overflow and report the complete active set.
- `server/services/islands/runIslandCalibration.js`: serialize persistence per user.
- `server/tests/config/islandCapacity.test.js`: parsing regression cases.
- `server/tests/islands/islandCapacity.test.js`: persistence/capacity regression cases.
- `server/tests/islands/runIslandCalibration.test.js`: transactional orchestration mocks.
- `server/tests/semantic/semanticRegression.batches.test.js`: cap assertion in both batches.
- `server/.env.example`, `server/services/islands/README.md`, `docs/interest-islands.md`:
  configuration, lifecycle and deterministic selection contract.
- `docs/island-capacity-validation.md`: this report.
