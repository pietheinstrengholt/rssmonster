# README.md

# Interest Island System

This document defines how RSSMonster builds and maintains Interest Islands.

```
Article
    ↓
Event
    ↓
Topic
    ↓
▶ Interest Island
```

Interest Islands are the highest semantic layer in RSSMonster.

They represent long-term user interests rather than the news itself.

All semantic data is user-scoped. Islands specifically represent behavioral
preference; Event and Topic membership does not by itself establish preference.

---

# Purpose

Interest Islands answer a single question:

> **What does this user consistently care about?**

Examples:

```
Artificial Intelligence

Linux & Self-hosting

Photography

Climate & Sustainability

Electric Vehicles
```

An Interest Island is **not**:

- a news story
- a Topic
- a feed category
- a semantic cluster of Articles

It represents a durable area of user interest.

---

# Design Principles

Interest Islands are intentionally:

- personal
- long-lived
- stable
- behavior-driven
- slowly evolving

Interest Islands should survive individual reading sessions and short-term news cycles.

Repeated evidence can establish durable interests. A single sufficiently strong
behavioral article can also create an Island; its authority is attenuated below.

---

# Sources of Evidence

Interest Islands consume two complementary evidence layers.

## Behavioral Articles

Direct user engagement.

Signals may include:

- starred articles
- clicked articles
- deep reading
- positive feedback
- negative feedback

These signals provide the strongest evidence of user interest.

---

## Topics

Interest Islands also consume persisted Topics.

These Topics summarize recurring semantic subjects discovered earlier in the pipeline.

Using Topics allows Islands to become broader and more stable than individual Articles.

Topics enrich Interest Islands.

They do not create them independently.

---

# Processing Pipeline

Interest Island generation follows a deterministic pipeline.

```
User Behavior
        ↓
Behavioral Article Profiles
        ↓
Candidate Islands
        ↓
Persist Islands
        ↓
Topic Enrichment
        ↓
Island ↔ Topic Relationships
        ↓
Article Interest Scores
```

Each stage builds upon the previous one.

Higher stages should never redefine lower semantic layers.

---

# Phase 1 — Behavioral Article Profiles

User engagement is converted into behavioral profiles.

Each profile typically contains:

- engagement score
- normalized vector
- publication time
- behavioral signals

Profiles are temporary processing artifacts.

They are not persisted.

---

# Phase 2 — Candidate Islands

Semantically similar behavioral profiles are clustered.

Each cluster becomes a candidate Interest Island.

Candidate Islands exist only during processing.

They become durable only after persistence.

---

# Phase 3 — Island Persistence

Each candidate Island is compared against existing Islands.

If a sufficiently similar Island already exists:

- update the vector
- update behavioral evidence
- update memberships
- update audit history

Otherwise:

- create a new Interest Island

Existing Islands should almost always evolve rather than be recreated.

When duplicate normalized island names exist:

1. Compare semantic similarity.
2. If similarity is high:
   - treat as duplicate and update/merge/prevent creation.
3. If similarity is low:
   - allow both.
   - keep the broader name for the stronger island.
   - rename the smaller or newer island with a distinguishing keyword phrase.

---

# Phase 4 — Topic Enrichment

Once Islands exist, persisted Topics are evaluated.

Topics that consistently relate to an Island become members of that Island.

Typical evidence includes:

- semantic similarity
- behavioral affinity
- user engagement
- temporal consistency

Island ↔ Topic memberships evolve gradually over time.

---

# Phase 5 — Article Interest Scoring

Finally unread Articles receive an Interest Score.

Three confidence-adjusted paths compete:

```text
Article → ArticleTopic → IslandTopic → Island
Article → direct vector similarity → Island
Article → explicit behavioral evidence without a same-sign Island
```

Topic and direct paths are both evaluated, retaining the strongest contribution
per Island. Explicit fallback does not create or contaminate Island membership.
See [Confidence-aware interest](#confidence-aware-interest) for the shared evaluator.

---

# Membership Evolution

Interest Island memberships should evolve slowly.

Prefer:

- confidence blending
- gradual decay
- incremental updates

Avoid:

- replacing memberships
- rebuilding Islands every run
- abrupt changes

Small behavioral changes should not significantly alter long-term interests.

---

# Population Audit

Every Interest Island maintains a compact audit history.

Typical information includes:

- contributing Topics
- contributing Articles
- behavioral evidence
- population metrics

The audit exists solely for explainability.

It should never become semantic evidence itself.

The system should be able to answer questions such as:

- Why does this Interest Island exist?
- Which Topics contributed?
- Which Articles strengthened it?

---

# Interest Scores

Interest Scores represent how strongly an Article aligns with a user's long-term interests.

Interest Scores are derived.

They should never become semantic evidence themselves.

They are intended for:

- ranking
- Smart Folders
- recommendations
- personalized discovery

---

# Source of Truth

Island relationships are stored in relationship tables.

```
IslandTopic
```

is the durable relationship between Islands and Topics.

Relationship tables remain the source of truth.

Derived scores, audits and statistics should never replace them.

---

# Architectural Boundaries

Interest Islands consume semantic knowledge.

They do **not**:

- group news Articles into Events
- create Events
- create Topics
- redefine semantic relationships

Events determine:

- what happened

Topics determine:

- what recurring subject it belongs to

Interest Islands determine:

- what consistently interests this user

These responsibilities should remain clearly separated.

---

# Explainability

Every Interest Island decision should be explainable.

The system should be able to answer:

- Why was this Topic added to this Island?
- Why did this Island evolve?
- Why did this Article receive a high Interest Score?
- Why does this Island represent this user's interests?

Explainability is a core architectural goal.

---

# Coding Principles

- Keep Island algorithms inside semantic services.
- Consume existing semantic layers rather than rebuilding them.
- Compare complete Topic-path confidence with direct-vector confidence.
- Reuse shared vector helpers.
- Blend vectors gradually.
- Preserve deterministic processing.
- Keep thresholds configurable.
- Preserve concise debug logging.

---

# Common Regression Traps

Avoid introducing changes that:

- give singleton Islands maximum confidence
- recreate Islands every processing run
- replace memberships instead of blending them
- use audit history as semantic evidence
- ignore IslandTopic relationship confidence
- ignore Topic enrichment
- force matches to improve personalization coverage
- make incremental processing behave differently from rebuilds
- Lower layers never depend on higher layers
- Higher layers consume lower layers
- No semantic layer may redefine the responsibility of another layer
- Incremental processing and rebuilds should converge to the same semantic state

---

# Definition of Done

An Interest Island change is complete when:

1. Islands represent durable user interests.
2. Island creation requires sufficient behavioral evidence.
3. Existing Islands evolve gradually rather than being recreated.
4. Topic enrichment strengthens Island semantics.
5. Article Interest Scores remain stable and explainable.
6. Relationship tables remain the source of truth.
7. Incremental processing and rebuilds converge toward the same semantic state.
8. Relevant tests and the [semantic trace](../../tests/semantic/README.md) pass without weakening expectations.

## Formation and replay safety

Community capacity never authorizes a below-threshold membership. Behavioral
Articles and Topic profiles may remain unassigned when no community qualifies
and the creation limit is reached. All similarity/affinity thresholds are retained.
Article profile arrays expose a transient `summary` with eligible, assigned and
unassigned behavioral profile counts.

Calibration profiles represent complete current evidence snapshots. Updating an
Island replaces its signal counters with that snapshot; it does not append the
same favorites or cumulative click counts again on every replay. Real changes in
current article behavior remain reflected in the next snapshot. Audit history
continues to record calibration runs and is not used as ranking evidence.

Recommended coverage is separate from interest coverage. The caller must supply
an authorized, visible article eligible for the requested view. No Event, Topic,
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
user, ordered by `publishedAt DESC`, then `id ASC`. Each article supports only its nearest
active Island at the existing Article membership threshold. This is a read-time
support estimate, not a membership mutation. Audit history is never ranking input.
Reports describe this current support estimate, not historical audit snapshots.

For independent article count `n`, distinct sources `s`, and publication days `d`:

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
Publication days are a proxy because likes/dislikes lack interaction timestamps.
No observed current support gives legacy Islands confidence .1; a fully coherent
same-sign singleton has confidence .35, not 1 or 0. Five coherent same-sign articles across
three sources/four days can reach 1. Mixed signs reduce confidence. Low cohesion
reduces authority; diagnostic classes themselves do not delete Islands.

Direct matches retain the configured `ISLAND_ARTICLE_SCORE_THRESHOLD` (default .62):

```
directRelationship = finite(similarity) && similarity > threshold && threshold < 1
  ? clamp((similarity-threshold)/(1-threshold)) : 0
topicRelationship = clamp(ArticleTopic.confidence)
                  * clamp(IslandTopic.confidence) * clamp(IslandTopic.similarity)
islandContribution = preferenceStrength * islandConfidence * relationshipConfidence
```

ArticleTopic has no separate similarity field. Missing relationship confidence is
zero. A missing Article vector does not prevent a trustworthy Topic path. Missing
all paths is exactly neutral interest and never prevents Recommended calculation.

Explicit likes/favorites and dislikes can outlive community capacity via a bounded
direct evidence fallback. Per sign, at most 100 canonical/unfiltered explicit
articles published within the last 90 days are considered, with stable date/ID
ordering. No absence of engagement, short read, or unread state counts as negative.
Only evidence without a qualifying same-sign Island uses fallback. This includes
negative evidence near a net-positive Island. Explicit negative overrides positive
flags for this fallback; clicks/deep reads alone do not trigger positive fallback.

```
recency = 2^(-publicationAgeDays/30)
behavioralContribution = sign * .25 * recency * directRelationship * intentCompatibility
```

Unknown/future publication times and age over 90 days do not qualify. These limits
bound work and influence; they are not a new Island cap or relaxed similarity gate.
Publication age may miss a new dislike on an old article; an accurate interaction
timestamp is a future schema decision. Replaying unchanged evidence cannot stack
penalties. Positive fallback follows the same small evidence path only when no
positive Island represents the explicit preference, so capacity does not erase
likes/favorites either.

For each Island take the path with largest absolute contribution (direct or Topic).
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
fallback formula above. It changes neither Island matching nor final Recommended
weights and does not create another aggregation channel.

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
The title heuristics are not a universal classifier, and publication age remains a
proxy for feedback recency. Held-out ranking evaluation should measure these limits.

## Preference strength, relationship storage, and diagnostics

Article profile formation uses +8 for more-like-this (`positiveInd`), +4 for favorites,
+2 per outbound click (at most three), +1 for attention bucket ≥3, and −8 for
not-interested (`negativeInd`). Feedback endpoints atomically set the chosen flag
and clear the opposite flag, so the last write wins even for concurrent requests.
For legacy rows with both explicit flags set, negative feedback suppresses the
explicit positive signal in formation, confidence and fallback. Favorites, clicks
and deep reads remain independent signals; no historical rows are rewritten.
Positive formation evidence uses existing publication recency decay. The candidate
weight is `clamp(averageProfileScore / 7 + sign(averageProfileScore) *
min(.2, memberCount * .03), -1, 1)`, rounded to four decimals. This signed
preference strength is distinct from confidence in its semantic generalization.

Formation obeys `ISLAND_ARTICLE_AFFINITY_THRESHOLD` (default .64),
`ISLAND_ARTICLE_SIGNAL_THRESHOLD` (.05), and `MAX_INTEREST_ISLANDS` (10 candidate
communities per calibration, not a guarantee that only ten stored Islands exist).
Persistence uses `ISLAND_PROFILE_MATCH_THRESHOLD` (.78) to reuse an Island and
`ISLAND_VECTOR_ALPHA` (.35) to blend its vector. Thresholds are not relaxed when
capacity is exhausted.

IslandTopic persists both similarity and confidence. Initial profile links use
`clamp(abs(topic.strength) * similarity)`. Topic enrichment additionally uses
`similarity * clamp(abs(topic.strength) + min(evidenceCount, 5) * .04, .25, 1)`;
its similarity/confidence gates and existing membership blending/decay still apply.
Weak links cannot transmit full preference through the scoring formula above.

| Value | Storage and use |
| --- | --- |
| Island vector, weight, signal snapshot | Persisted calibration state; weight supplies signed preference. |
| IslandTopic similarity/confidence | Persisted relationship evidence; used in Topic scoring paths. |
| Bounded population audit | Persisted explanation history; never ranking evidence. |
| Member count, distinct behavioral articles/sources/publication days, median/minimum similarity, positive/negative article counts | Derived from current bounded support; numerical inputs to Island confidence. |
| Singleton, weak support (<3 articles), low cohesion (median below formation threshold), mixed sign, no current support, strong/coherent | Derived diagnostic classifications; never deletion rules or separate score terms. Strong/coherent requires ≥3 measured members, all above threshold, without mixed signs. |
| Island confidence, path confidence, intent compatibility | Derived at evaluation time; not separately persisted. |
| Article interestScore | Persisted derived signed score; never reused as behavioral evidence. |
| Recommended | Runtime ranking score for eligible Articles. |

Scoring updates canonical, unfiltered, unread Articles (optionally restricted by
creation time) in batches of 200. This update scope is separate from runtime
Recommended eligibility. An authorized eligible Article needs no vector, Event,
Topic or Island to receive Recommended; unmatched interest is zero. See the
[authoritative final scoring formula](../../../docs/scoring.md) for weights and
optional input defaults.

### Trace fields and limitations

The [semantic reports](../../tests/semantic/README.md) expose Island preference,
confidence, source/day breadth, member similarity, signs and classifications.
Selected article paths include match type, semantic similarity, relationship
confidence and signed contribution. Topic paths additionally include ArticleTopic
and IslandTopic confidence. Explicit fallback includes source article ID, explicit
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
