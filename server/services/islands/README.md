# Interest Island System

Interest Islands are the authoritative user-specific personalization representation.
Events identify occurrences; Islands represent signed behavioral preferences.

```text
canonical Articles + behavior → behavioral profiles → persisted Interest Islands
candidate Article vector → direct Island comparison → interestScore → Recommended
```

## Services and persistence

`islandArticleProfiles.js` builds bounded communities from favorites, clicks,
attention and explicit positive/negative feedback. `islandPersistence.js` matches
profiles to existing Islands, blends vectors, replaces signal snapshots, and
records bounded source-article audits. `runIslandCalibration.js` orchestrates
profile creation, persistence and scoring. Normal crawl processing scores new
articles against existing Islands; it does not recalibrate behavioral memory.

An Island stores its vector, signed weight, signal snapshot, display labels,
archive state and population audit. There is no persisted candidate-Article
membership table. Audit history explains formation; it is not new evidence.
Names use the nearest taxonomy label or the profile's source-article label.
Duplicate names are disambiguated using semantic and source-article evidence.

Matched or unmatched Islands can archive when meaningful behavioral activity is
at least 45 days old and decayed lifecycle confidence is below .12. Technical
`updatedAt` is never activity. Strong matching behavior newer than `archivedAt`
can reactivate an archived Island with its existing ID. Archival retains its history.

## Boundaries

`embedding_model` records the shared model of the contributing Article vectors.
Formation, matching, blending, taxonomy naming, support confidence, duplicate-name
similarity and recommendation evidence require identical non-empty model identifiers
and equal vector dimensions. Unknown vectors supply no semantic evidence; unmatched
Articles retain neutral interest and remain eligible for Recommended. Models are
never inferred from the current configuration. Re-embedding legacy vectors is an
explicit operation; calibration does not silently convert existing spaces.

No arbitrary news clustering creates behavioral preferences. Capacity cannot
force unrelated evidence into an Island. Generated labels are presentation only.
All sources and candidates belong to the same user. Changes to formation or
scoring require the frozen before/after workflow in the semantic test README.

## Formation and replay safety

Community capacity never authorizes a below-threshold membership. Behavioral
Articles may remain unassigned when no community qualifies
and the creation limit is reached. All similarity/affinity thresholds are retained.
Article profile arrays expose a transient `summary` with eligible, assigned and
unassigned behavioral profile counts.

Calibration profiles represent complete current evidence snapshots. Updating an
Island replaces its signal counters with that snapshot; it does not append the
same favorites or cumulative click counts again on every replay. Real changes in
current article behavior remain reflected in the next snapshot. Audit history
continues to record calibration runs and is not used as ranking evidence.

Recommended coverage is separate from interest coverage. The caller must supply
an authorized, visible article eligible for the requested view. No Event,
Island, embedding, or nonzero interest is required by Recommended calculation.
Missing interest means zero; missing Event means zero corroboration. Existing
quality defaults remain 70 for unavailable article quality components and 0.5 for
feed trust. A missing plain-object freshness signal keeps the existing 0.5
fallback; the Article model reports zero freshness when publication time is absent.
Required identity/ownership data is never synthesized to make an article eligible.
Recommended remains a runtime score; its existing weights are unchanged.

## Confidence-aware interest

`islandInterestConfidence.js` is the shared evaluator used by scoring, API Island
attribution and regression explanations. Recent semantic changes improve the
`interestScore` input; final Recommended weights have not been retuned.

`preferenceStrength = clamp(Island.weight, -1, 1)` retains the existing signed
behavioral preference. It is separate from Island confidence and relationship
confidence. No new evidence or confidence fields are persisted.

Confidence uses at most 500 current canonical, unfiltered behavioral articles per
user, ordered by latest active interaction time descending, then `id ASC`. Each article supports only its nearest
active Island at the existing Article membership threshold. This is a read-time
support estimate, not a membership mutation. Audit history is never ranking input.
Reports describe this current support estimate, not historical audit snapshots.

For independent article count `n`, distinct sources `s`, and interaction days `d`:

```
support = .35 + .35*clamp((n-1)/4) + .15*clamp((s-1)/2) + .15*clamp((d-1)/3)
cohesion = (clamp(medianSimilarity) + clamp(minimumSimilarity)) / 2
consistency = totalSignedArticles > 0
  ? .5 + .5 * max(positiveArticles, negativeArticles) / totalSignedArticles
  : .5
islandConfidence = clamp(support * cohesion * consistency)
```

Here clamp without explicit bounds means [0,1]. Missing similarity uses zero.
`totalSignedArticles` is positiveArticles + negativeArticles; an Article with both
signs counts in each sign tally. Distinct canonical articles count
once regardless of replayed calibration, click quantity or favorite strength.
Sources and days provide capped breadth, not claims of editorial independence.
Interaction days use each article’s latest active signal; null legacy clocks fall back to publication.
No observed current support gives legacy Islands confidence .1; a fully coherent
same-sign singleton has confidence .35, not 1 or 0. Five coherent same-sign articles across
three sources/four days can reach 1. Mixed signs reduce confidence. Low cohesion
reduces authority; diagnostic classes themselves do not delete Islands.

Direct matches retain the configured `ISLAND_ARTICLE_SCORE_THRESHOLD` (default .62):

```
directRelationship = finite(similarity) && similarity > threshold && threshold < 1
  ? clamp((similarity-threshold)/(1-threshold)) : 0
islandContribution = preferenceStrength * islandConfidence * relationshipConfidence
negativeIslandContribution = islandContribution * intentCompatibility
```

A missing or invalid Article vector produces no semantic match. Missing all paths
means neutral interest and never prevents Recommended calculation.

Explicit likes/favorites and dislikes can outlive community capacity via a bounded
direct evidence fallback. Per sign, at most 100 canonical/unfiltered explicit
articles with the corresponding interaction within the last 90 days are considered, with stable date/ID
ordering. No absence of engagement, short read, or unread state counts as negative.
Only evidence without a qualifying same-sign Island uses fallback. This includes
negative evidence near a net-positive Island. Explicit negative overrides positive
flags for this fallback; clicks/deep reads alone do not trigger positive fallback.

```
recency = 2^(-interactionAgeDays/30)
behavioralContribution = sign * .25 * recency * directRelationship * intentCompatibility
```

Unknown/future interaction times and age over 90 days do not qualify. These limits
bound work and influence; they are not a new Island cap or relaxed similarity gate.
A fresh dislike on an old article qualifies through `negativeFeedbackAt`. Replaying unchanged evidence cannot stack
penalties. Positive fallback follows the same small evidence path only when no
positive Island represents the explicit preference, so capacity does not erase
likes/favorites either.

Each Island contributes through the direct Article-to-Island comparison.
Across distinct Islands and behavioral profiles, retain only the strongest positive
and strongest negative contribution; add these two and clamp to [-1,1], rounding
the persisted interest score to four decimals. This conservative max-per-sign
strategy prevents correlated interests and duplicate profiles from accumulating
while allowing opposing evidence to offset each other. Stable IDs break ties.

Trace output includes selected paths, signed contributions, confidence factors,
behavioral source IDs, recency and seed/self status, never bodies or vectors.
Behavioral articles are marked seed/self even when another profile supplies their
match. Only articles with no behavioral evidence are reported as held-out; controlled
regressions additionally prove they were absent from formation evidence.

## Behavioral intent specificity

`behavioralIntent.js` supplies the bounded `intentCompatibility` factor in the
explicit fallback and negative Island formulas above. It changes neither Island matching nor final Recommended
weights and does not create another aggregation channel.

Negative Island intent is reconstructed from the existing bounded current Article
support used for confidence. Only Articles with `negativeInd` set contribute to
this intent, including those that also have favorites, clicks or deep reads;
positive-only support never determines a negative contribution's intent. A single
recognizable intent must be unanimous across that negative support. Mixed intents,
unknown members, or no negative support resolve to unknown and use the existing
.5 missing-intent factor, never a confident exact match. This estimate is limited
to the current 500-Article support bound, not a reconstruction of every historical
formation member. Aggregate signal snapshots and population audits are not used
as intent evidence, and no new schema or inference is required.

The fast `explicit_feedback_refresh` retains Article-to-Article compatibility.
After `personalization_refresh` calibrates Islands, the same classifier and
compatibility policy apply to negative direct Island paths during normal unread
rescoring. Thus a coherent promotion dislike retains strong promotion suppression
and .05 transfer to reviews; Island weight/confidence can change its magnitude.
Positive direct Island contributions remain unattenuated across intents. Sign
handling, confidence, semantic thresholds and both existing refresh jobs are unchanged.

A small deterministic vocabulary distinguishes promotion, review, technical,
product-report, editorial, and unknown. Explicit title sales/review/technical
wording takes precedence. A bounded description excerpt can corroborate review
intent; article bodies are not read. Advertisement score is used only with a
classification completion timestamp or an explicit action override: imported zero
placeholders are not proof of promotion. RSSMonster's high advertisement score
means less promotion. Descriptive hardware/product titles without sales cues can
be product reports; no brand-specific rules or generated labels are used.

Compatibility is 1 for the same known intent, .05 across promotion/nonpromotion,
.75 between other known intents, and .5 if either intent is unknown. The rule is
symmetric for explicit positive and negative evidence. Missing intent attenuates
conservatively; mismatch never hard-rejects. Shared products cannot override a
commercial/editorial mismatch. Only explicit negative flags cause negative transfer.

Diagnostics report source/target intent, compatibility and same-intent,
cross-intent-attenuated or missing-intent paths, alongside the interest confidence factors.
The title heuristics are not a universal classifier. Held-out ranking evaluation
should measure these limits.

## Preference strength, relationship storage, and diagnostics

Article profile formation uses +8 for more-like-this (`positiveInd`), +4 for favorites,
+2 per outbound click (at most three), +1 for attention bucket ≥3, and −8 for
not-interested (`negativeInd`). Feedback endpoints atomically set the chosen flag
and clear the opposite flag, so the last write wins even for concurrent requests.
For legacy rows with both explicit flags set, negative feedback suppresses the
explicit positive signal in formation, confidence and fallback. Favorites, clicks
and deep reads remain independent signals; no historical rows are rewritten.
Formation evidence applies each signal's half-life separately to its
interaction clock before summing. The candidate
weight is `clamp(averageProfileScore / 7 + sign(averageProfileScore) *
min(.2, memberCount * .03), -1, 1)`, rounded to four decimals. This signed
preference strength is distinct from confidence in its semantic generalization.

Formation obeys `ISLAND_ARTICLE_AFFINITY_THRESHOLD` (default .64),
`ISLAND_ARTICLE_SIGNAL_THRESHOLD` (.05), and the bounded formation pass described
in [active capacity](../../../docs/interest-islands.md#active-capacity).
`MAX_INTEREST_ISLANDS` defaults to 20 and now caps ACTIVE persisted Islands per
user. Archived history does not count. Decimal integers 1–1000 are accepted;
invalid values fall back to 20. Formation retains the same numerical bound, but
persistence independently enforces it over retained, new and reactivated Islands.
Persistence uses `ISLAND_PROFILE_MATCH_THRESHOLD` (.78) to reuse an Island and
`ISLAND_VECTOR_ALPHA` (.35) to blend its vector. Thresholds are not relaxed when
capacity is exhausted.

| Value | Storage and use |
| --- | --- |
| Island vector, weight, signal snapshot | Persisted calibration state; weight supplies signed preference. |
| Bounded population audit | Persisted explanation history; never ranking evidence. |
| Member count, distinct behavioral articles/sources/interaction days, median/minimum similarity, positive/negative article counts | Derived from current bounded support; numerical inputs to Island confidence. |
| Singleton, weak support (<3 articles), low cohesion (median below formation threshold), mixed sign, no current support, strong/coherent | Derived diagnostic classifications; never deletion rules or separate score terms. Strong/coherent requires ≥3 measured members, all above threshold, without mixed signs. |
| Island confidence, path confidence, intent compatibility | Derived at evaluation time; not separately persisted. |
| Article interestScore | Persisted derived signed score; never reused as behavioral evidence. |
| Recommended | Runtime ranking score for eligible Articles. |

Scoring updates canonical, unfiltered, unread Articles (optionally restricted by
creation time) in batches of 200. This update scope is separate from runtime
Recommended eligibility. An authorized eligible Article needs no vector, Event,
or Island to receive Recommended; unmatched interest is zero. See the
[authoritative final scoring formula](../../../docs/scoring.md) for weights and
optional input defaults.

### Trace fields and limitations

The [semantic reports](../../tests/semantic/README.md) expose Island preference,
confidence, source/day breadth, member similarity, signs and classifications.
Selected article paths include match type, semantic similarity, relationship
confidence and signed contribution. Explicit fallback includes source article ID, explicit
sign, recency, source/target intent, compatibility and intent-match type. Seed/self
and held-out totals are distinct; self-similarity is not generalization evidence.
These confidence diagnostics are report data, not a promise that every field is
exposed by the Settings API. Bodies and vectors are excluded from decision traces.

Intent precedence is title promotion → review → technical hints, then review
phrases in the first 800 characters of stripped description, then a provenance-valid
advertisement score (≤30 promotion, ≥70 editorial), then hardware-title product
hints, then unknown. Titles are bounded to 500 characters. Classification provenance
requires `aiAnalysisCompletedAt` or `advertisementScoreActionOverrideInd`; a zero
placeholder or status string alone is insufficient. Launch/update are not separate
intent categories. No product/entity override defeats an intent mismatch.

Missing support, broad taxonomy labels, and limited multilingual subject/intent
recognition remain limitations. Low observed contamination and passing held-out
cases do not prove optimal ranking or justify raising personalization weights.

## Interaction timestamps and legacy behavior

Article stores nullable `lastClickedAt`, `favoritedAt`, `positiveFeedbackAt`,
`negativeFeedbackAt`, and `lastMeaningfulReadAt`. The authenticated mutation sets
server time; unfavorite clears its clock, and explicit feedback clears the
opposite flag and clock atomically. Repeated clicks/deep-read reports refresh
their clocks. Read/unread toggles do not invent deep-read evidence. Existing
firstSeen/attention-bucket and Event read-cascade semantics are retained, but the
deep-read timestamp belongs only to the article actually viewed.

Formation retains +8 positive, +4 favorite, +2 per click (capped at three), +1 deep
read, and −8 negative weights. Each term, including negative feedback, uses its
own timestamp and `2^(-max(0, ageDays) / halfLifeDays)`, with no permanent floor.
`SIGNAL_HALF_LIFE_DAYS` maps interaction fields to positive finite environment
configuration (invalid/missing values use the defaults):

| Signal / clock | Environment variable | Half-life in days |
| --- | --- | ---: |
| Click / `lastClickedAt` | `ISLAND_CLICK_HALF_LIFE_DAYS` | 30 |
| Deep read / `lastMeaningfulReadAt` | `ISLAND_DEEP_READ_HALF_LIFE_DAYS` | 90 |
| Favorite / `favoritedAt` | `ISLAND_FAVORITE_HALF_LIFE_DAYS` | 365 |
| More-like-this / `positiveFeedbackAt` | `ISLAND_POSITIVE_FEEDBACK_HALF_LIFE_DAYS` | 730 |
| Not-interested / `negativeFeedbackAt` | `ISLAND_NEGATIVE_FEEDBACK_HALF_LIFE_DAYS` | 365 |

These initial defaults let incidental clicks fade within weeks, meaningful reads
within months, and deliberate preferences persist across years. They are not
fitted to regression fixtures. The old 1460-day exponential time constant and .2
floor are removed; `ISLAND_RECENCY_HALF_LIFE_DAYS` and `ISLAND_RECENCY_MIN_WEIGHT`
are no longer read. Raw signal counters, click cap, signed profile aggregation,
intent compatibility, confidence equations and similarity thresholds are unchanged.
See [the behavioral examples](../../../docs/interest-islands.md#decay-examples-and-configuration-migration)
for retained influence at 7, 30, 90, 180 and 365 days.

The existing calibration/refresh lifecycle evaluates decay and updates persisted
scores; elapsed time alone does not enqueue a new job. Island archival uses
current decayed support as described below. Explicit negative fallback
uses `negativeFeedbackAt`, the existing 90-day window and 30-day half-life.
Positive fallback evaluates positive feedback and favorites on their own clocks
and keeps the strongest positive path; it does not add correlated fallback scores.
Confidence uses interaction-day breadth with the same count, source and day weights.

For a signal whose timestamp is null (legacy/imported behavioral state without a
known interaction time), publication time remains the documented approximation.
No usable date retains the existing unknown-age multiplier of 1; future dates
are clamped to zero age. Neither case produces non-finite profile evidence.
The migration leaves nulls intact rather than manufacturing interaction times.
Known clocks always override publication; rereading or favoriting a 2022 article
today produces fresh timing evidence. Publisher revisions preserve these clocks.
Automated favorite/click rules stamp when their state is first applied on ingestion;
re-crawling an existing article does not refresh user behavior. Feed reconciliation
retains the latest stored clock for each signal without treating merging as an
interaction. No event-history table, signal weight or semantic threshold is added.

## Behavioral lifecycle and replay

`islandLifecycle.js` derives `lastBehaviorAt` and lifecycle confidence from the
same Article evidence used for profile formation. No schema or persisted activity
clock is added. `buildInterestIslandProfilesForUser` passes its complete owned,
canonical/unfiltered behavioral snapshot as a transient array property to
persistence, including Articles below the formation score cutoff. Standalone
profile persistence reconstructs that snapshot once when it is not supplied.

Matched profiles use their actual Article IDs. Only unmatched active Islands
need nearest-support reconstruction among the current active Islands, using the
existing affinity threshold. Archived Islands remain in normal profile matching;
unmatched archives are neither scanned for lifecycle support nor deleted. The
scoring evidence bound of 500 remains unchanged and is not used as an absence
test for lifecycle support.

For each supporting Article, reuse `computeArticleSignals`. Normalize each
currently meaningful signal independently: its retained fraction is its existing
recency multiplier, provided its weighted decayed contribution reaches the Article
signal cutoff. Take the strongest fraction, then multiply by signed agreement:
`abs(positiveScore - negativeScore) / (positiveScore + negativeScore)`, clamped to
0–1 (zero total gives zero). Thus aging clicks cannot dilute a surviving favorite,
even before they become exhausted, while opposing evidence still reduces support.
Raw weights, click caps, decay and contradictory-feedback handling are unchanged.
Lifecycle confidence is existing cohesion/support confidence over currently
qualifying Articles multiplied by the strongest remaining fraction among those
Articles. No support gives zero. Taking the strongest remaining fraction avoids diluting a surviving strong
preference with arbitrarily much weak history. This factor is used only for lifecycle decisions, never
as a new recommendation multiplier.

An interaction contributes behavioral age only when both its individual decayed
signal magnitude and its Article's absolute net evidence reach the existing
article signal threshold. The latest usable, non-future interaction wins; null
clocks use publication as the legacy fallback. Missing age is stale, never
replaced with Island `createdAt`, `updatedAt`, audit time or calibration time.

Outside capacity enforcement, an active Island is archived only when stale (`ISLAND_ARCHIVE_STALE_DAYS`, 45)
and weak (lifecycle confidence below `ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD`, .12).
This applies even if old evidence still forms a matching profile. An archived
match reactivates only at sufficient confidence and with a meaningful interaction
strictly newer than its archive time; a legacy null archive time instead requires
non-stale support. Otherwise preserve its archive time, flags and ID. Strong but
old evidence can sustain an active Island, but cannot resurrect an archive merely
by being recalibrated. Newly formed weak/stale profiles may be stored archived.

All changes participate in the existing persistence transaction and calibration
checkpoint. Scoring retries skip committed calibration, preserving lifecycle and
behavioral clocks. New behavior already requests another refresh through the
existing jobs. Duplicate-name handling, vector match thresholds, scoring queries
excluding archived Islands, Events and automatic-deletion behavior are unchanged.


## Capacity selection

`islandCapacity.js` reconstructs current support from the owned behavioral
snapshot. Matched Islands use profile Article IDs; unmatched candidates reuse
nearest-support assignment. Rank by absolute existing profile-weight formula,
then lifecycle confidence (four-decimal precision), qualifying support count,
latest meaningful interaction and ascending stable ID. This is a lexicographic
storage policy, not a recommendation formula; signed preferences compete equally.
Capacity is applied after normal lifecycle/name archival, before the checkpoint
commits. Overflow is archived with history intact. Reactivation must satisfy the
normal behavioral gate **and** compete for a slot; matching still reuses existing
archived IDs before creation. User-row locking (SQLite immediate transactions)
serializes persistence. Summaries report the complete final active count and
`capacityArchivedIslandIds`, including unmatched historical rows that lose slots.

The existing formation bound remains to preserve clustering and bounded work;
it does not promise that every unassigned behavioral profile competes globally.
See [the exact contract and ordering](../../../docs/interest-islands.md#active-capacity).
