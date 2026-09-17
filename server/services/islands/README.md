# Interest Island System

## Interest evaluation diagnostics

The scorer emits `[INTEREST FUNNEL]` for each successful pass. `eligibility` counts
mutually exclusive exclusions (filtered, duplicate, not unread, before creation window)
and eligible rows using one owned aggregate query. `scannedCount` counts rows actually
read; `scopeSkippedCount` counts fast-feedback neighborhood exclusions.
`candidatesRescored` includes neutral evaluations, `positiveCount`/`negativeCount`/
`neutralCount` partition those evaluations, and `interestScoresChanged` counts successful
value changes. `unchangedCount` counts equal stored values, while
`recordedEvaluationCount` counts persisted evaluation timestamps.
`nonzeroInterestCount` is the explicit name for the legacy `updatedCount` compatibility
field; that legacy field does not count writes. `fallbackScoredCount` remains the legacy
direct-Island path count; `behavioralScoredCount` counts explicit fallback paths,
and `implicitScoredCount` counts selected recent click/read paths.

`zeroReasons` partitions neutral results by no eligible evidence, no compatible vector,
no recent fallback signal, below similarity threshold, zero preference/confidence,
signed cancellation or rounding to zero. `islandMatches` counts zero/one/multiple
qualifying Island relationships before strongest-per-sign path selection. Source-level
explicit fallback suppression is reported separately from target-level threshold rejection.
Evidence-query limits and windows still apply; excluded evidence outside those queries
cannot be attributed to an individual target by this evaluator.

`Article.interestScoredAt` records successful evaluations including unchanged neutral
results. A batch metadata update stamps unchanged rows without changing their `updatedAt`;
skipped/ineligible rows remain untouched. Legacy clocks stay null. Apply migration
`20260915001000-add-interest-scored-at.mjs` before running the updated application.
The clock records evaluation time, not freshness of the underlying Island calibration.
No behavioral signal uses this timestamp.

The diagnostics regression cases reproduce the known target-specific fallback loss
and verify that duplicate-name cleanup preserves both preference signs and held-out
scores. Similarity thresholds, capacity and Recommended weights are unchanged.

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
Canonical names are normalized across every owned Island, including archived history.
Creation and matched updates reserve other Islands’ names but exclude their own current
name, so replay does not add suffixes. Duplicate-name cleanup also includes archived
Islands and reserves their suffixes. Collisions receive distinguishing source-article
phrases or unique suffixes.
Name cleanup only updates labels, even for identical vectors and opposing signs;
it never archives or consolidates semantic evidence. Audit count and absolute weight
only decide which Island retains the base display name. Similarity is logged for
diagnostics. The legacy `archived` summary stays empty. Previously archived Islands
are not automatically reactivated; normal lifecycle and capacity rules still apply.

Matched and unmatched Islands expire after `ISLAND_INACTIVITY_DAYS` (default 90,
configurable from 30 to 90 days) without qualifying behavior, regardless of strength.
The persisted `lastBehaviorAt` clock comes only from supporting Article interactions.
Scoring, capacity and presentation enforce expiry before archival is persisted.
Reactivation requires qualifying behavior strictly newer than the actual expiry or
earlier archival boundary and retains the existing ID and history.

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

Click reduction retains the existing seven-point Island normalization scale, so
unchanged favorites and other signals are not amplified. Stored click counts and
interaction timestamps are retained; only the scored contribution is capped.

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
Evidence without a qualifying same-sign Island uses fallback. An Island whose
current support contains multiple explicit sign/intent groups also leaves these
Article-level paths available: its averaged weight cannot represent those distinct
preferences. This includes negative evidence near a net-positive Island. Explicit negative overrides positive
flags for this fallback; clicks/deep reads alone do not trigger positive fallback.

```
recency = 2^(-interactionAgeDays/30)
behavioralContribution = sign * .25 * recency * directRelationship * intentCompatibility
```

Unknown/future interaction times and age over 90 days do not qualify. These limits
bound work and influence; they are not a new Island cap or relaxed similarity gate.
A fresh dislike on an old article qualifies through `negativeFeedbackAt`. Replaying unchanged evidence cannot stack
penalties. Positive fallback follows the same small evidence path when no non-conflicting
positive Island represents the explicit preference, so capacity does not erase
likes/favorites either. Conflict detection uses the existing bounded current support,
not audits or generated labels. It does not change durable formation, matching,
Island weights or support assignment.

### Recent implicit evidence

Clicks and deep reads have an independent, positive-only Article path, including
when formation or durable capacity cannot admit their interest. At most 100 owned,
canonical, unfiltered sources with no explicit positive, favorite or negative flag
qualify. Each signal must have a known interaction timestamp within seven days;
publication time cannot establish recent implicit interest. Unknown, future and
expired clocks are rejected independently. The loader reads at most 100 clicks and
100 deep reads, deduplicates Articles, sorts by the newest valid interaction then ID,
and keeps 100 combined sources. This route has its own bound and is not limited to
the 500 Articles used for Island confidence.

```
implicitRecency = 2^(-interactionAgeDays/3)
implicitContribution = authority * implicitRecency * directRelationship * intentCompatibility
```

Authority is .05 for an outbound click and .10 for attention bucket ≥3, below the
explicit fallback's .25. Click counts and repeated reads never multiply authority.
Existing model/dimension checks, the configured scoring similarity threshold, and
Article-to-Article intent compatibility still apply. Only the strongest positive
path survives across implicit sources, explicit evidence and Islands; the strongest
negative path remains separate. Thus the new route cannot stack correlated evidence
or infer a dislike. The existing refresh jobs evaluate it without a new schema/job.

Diagnostics expose `implicitSourcesConsidered`, `qualifyingImplicitSignals`, and
`expiredOrUndatedImplicitSignals`. Selected paths use `matchType=implicit-behavior`
and `implicitType=click|deep-read`, with source ID, intent, recency and contribution.
Trace reports count these separately as `Recent implicit matches`.

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
+1 per outbound click (at most two; +2 total), +1 for attention bucket ≥3, and −8 for
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

Formation retains +8 positive, +4 favorite, +1 per click (capped at two; +2 total), +1 deep
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

The calibration/refresh lifecycle evaluates decay and updates persisted scores.
The AI worker also schedules due users through the existing refresh queue (daily
by default, checked hourly), using `User.personalizationRefreshedAt` to track the
evidence time of successful full refreshes. Elapsed-only refreshes preserve matched
centroids instead of repeatedly blending the same evidence; behavioral refreshes
retain normal vector adaptation. See [the scheduler contract](../jobs/README.md#elapsed-time-refresh).
Island archival uses
current decayed support as described below. Explicit negative fallback
uses `negativeFeedbackAt`, the existing 90-day window and 30-day half-life.
Positive fallback evaluates positive feedback and favorites on their own clocks
and keeps the strongest positive path; it does not add correlated fallback scores.
Confidence uses interaction-day breadth with the same count, source and day weights.

Interaction and publication dates must be valid and no later than the evaluation
clock. Missing, invalid or future interaction timestamps fall back to a usable
publication date as a legacy approximation. If neither is usable, the signal has
zero recency weight and cannot form, renew or reactivate an active Island. Bounded
SQL evidence selection applies the same fallback before ordering and limits, and
excludes evidence without usable active-signal clocks. Recent implicit fallback
still requires an observed interaction; it never substitutes publication time.
Usable interaction clocks always override publication; publisher revisions preserve
these clocks. No migration manufactures interaction dates.
Automated favorite/click rules stamp when their state is first applied on ingestion;
re-crawling an existing article does not refresh user behavior. Feed reconciliation
retains the latest stored clock for each signal without treating merging as an
interaction. No event-history table, signal weight or semantic threshold is added.

## Behavioral lifecycle and replay

`islandLifecycle.js` derives `lastBehaviorAt` and lifecycle confidence from the
same Article evidence used for profile formation. The resulting activity clock is
persisted as `lastBehaviorAt` for deadline enforcement. `buildInterestIslandProfilesForUser` passes its complete owned,
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

Determine the resulting signed preference before deriving activity: matched/new
profiles use their newly calculated weight; unmatched Islands recalculate and
persist their weight from reconstructed support with the same Article-weight
aggregation. This keeps the stored sign consistent with the renewal decision.
Only individual signals supporting that resulting sign can contribute a renewal
or reactivation timestamp. A fresh click cannot renew a still-negative preference;
fresh negative feedback cannot renew a still-positive aggregate. If new evidence
changes the result's sign, supporting evidence for the new sign can renew it under
the normal expiry, reactivation and capacity rules. Exact cancellation has no
supporting sign and therefore no renewal clock. Formation prioritization uses the
same rule for each Article's net preference.

An interaction contributes behavioral age only when both its individual decayed
signal magnitude and its Article's absolute net evidence reach the existing
article signal threshold. The latest usable supporting interaction wins, using
the validated legacy publication fallback when needed. Missing age is stale,
never replaced with Island `createdAt`, `updatedAt`, audit or calibration time.

An Island expires exactly at `lastBehaviorAt + ISLAND_INACTIVITY_DAYS`, independent
of lifecycle confidence. The old stale-days and confidence archival settings are
retired. Delayed archival records the actual expiry time, not the calibration time.
Early capacity archival uses its earlier timestamp. Reactivation requires usable
support strictly newer than that boundary, with its own deadline still in the future.
Replaying unchanged evidence cannot reactivate an Island. Unknown archival boundaries
remain dormant. Expired profiles may be retained as archived history.

The nullable `lastBehaviorAt` column and active-query index require the accompanying
migration. Legacy unknown clocks are inactive until ordinary calibration reconstructs
them from qualifying Article evidence; no technical timestamp backfill is performed.
Scoring queries exclude expired, unknown and future clocks. Capacity ranking and the
Settings overview use the same deadline; the overview retains history, exposes
`expiresAt`, marks expired rows archived and gives them zero effective weight even
before an archival write. Formation considers fresh qualifying seeds before expired
history so old strong preferences cannot consume all available formation slots.

All changes participate in the existing persistence transaction and calibration
checkpoint. Scoring retries skip committed calibration, preserving lifecycle and
behavioral clocks. New behavior already requests another refresh through the
existing jobs. Duplicate-name handling, vector match thresholds, scoring queries
excluding archived Islands, Events and automatic-deletion behavior are unchanged.

Behavioral evidence is loaded and profiles are built after taking the user lock,
inside the persistence transaction. Precomputed profiles carrying a behavioral
snapshot are rebuilt under that lock, so a delayed calibration cannot overwrite
newer feedback, activity clocks or audit evidence.

Recommended search and Article detail reads check for owned Island expiry or
archival boundaries since the oldest cached score. If a boundary was crossed (or
an Island clock is unknown/future), the existing interest evaluator recomputes the
request's Articles using one bounded evidence context and batches of 200 Article
representations. These corrections affect ordering and presentation only; they do
not persist scores, archive Islands or enqueue work. Persisted scoring timestamps
record when evidence was loaded, so a long scoring pass cannot hide crossed expiry.


## Capacity selection

`islandCapacity.js` reconstructs current support from the owned behavioral
snapshot. Matched Islands use profile Article IDs; unmatched candidates reuse
nearest-support assignment. Rank by absolute existing profile-weight formula,
then lifecycle confidence (four-decimal precision), latest meaningful interaction
and ascending stable ID. Support count is retained for explanation, not a tie-breaker. This is a lexicographic
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


## Retained lifecycle explanations

Population audits are explanatory snapshots, never behavioral input. Each retained
entry includes explicit likes/dislikes, favorites, click counts and meaningful-reading
buckets, plus their interaction timestamps and publication/read/exposure context.
`signalTimes` identifies active signals, the effective validated time, and whether it
came from the interaction, a legacy publication fallback, or no usable clock. The
configured half-life and current recency multiplier make signal aging inspectable. Raw
future or invalid dates remain distinguishable from their effective fallback.

Available rule provenance is captured from owned `tagType: rule` assignments: tag ID,
name and assignment creation time. The schema does not persist the originating rule
ID or its definition; a rule tag is contextual provenance, not proof that a rule caused
a particular interaction. Deleted tags do not erase a retained snapshot.

`lifecycle` records creation, renewal, unchanged activity, inactivity expiry, absent
qualifying activity, reactivation and rejected reactivation. Entries include the
signed preference, before/after clocks, deadline, boundary and confidence used in the
decision. Unmatched Islands also record current support and lifecycle decisions.
Capacity archival adds the candidate's rank and comparison values, the last retained
candidate's values, the exact lexicographic order and decisive field. Archive writes
and audit updates share the persistence transaction; capacity metadata preserves the
same run's source snapshot. None of these records can renew a behavioral clock.

Retention is bounded by `ISLAND_AUDIT_MAX_RUNS` (default 30) and
`ISLAND_AUDIT_MAX_ARTICLE_IDS` (default 300) per snapshot/list. Counts describe all
loaded support while retained titles are capped at 300 characters. Each Article
retains at most 10 rule tags with names capped at 255 characters; a bounded batched
query reports truncation. Each run retains at most two lifecycle decisions (ordinary
lifecycle plus capacity), with only the losing and cutoff candidates for comparisons.
The settings API exposes the retained audit and preserves historical positive/read
badges when current Article flags change. Legacy entries remain readable but cannot
recover interaction clocks or decision reasons that were never recorded.
