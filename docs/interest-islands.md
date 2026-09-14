---
layout: page
title: Interest Islands
parent: How RSSMonster Works
nav_order: 6
---

# Interest Islands

Interest Islands are RSSMonster's personal semantic layer. They represent
areas that a user repeatedly engages with—or explicitly avoids—rather than the
news itself.

Examples might include artificial intelligence, photography, self-hosting,
electric vehicles, or a particular game franchise. Every user's Islands are
private to that account and are learned only from that user's articles and
behavior.

An Interest Island answers **what does this user consistently care about?** It
is not an [Event]({% link events.md %}), a a feed category, or simply a
folder of similar articles.

## Where Islands Fit

```text
Articles and reading behavior
        |
        v
Behavioral article profiles
        |
        v
Candidate Interest Islands
        |
        v
Persist or update Islands
        |
        v
Score unread articles
```

Events describe individual occurrences. Interest Islands learn from canonical
article behavior and match candidate article vectors directly.

## Behavioral Evidence

Island calibration starts with canonical, vectorized articles that carry an
explicit behavioral signal. The current signal weights are:

| Signal | Contribution |
| --- | ---: |
| Positive feedback | `+8` |
| Bookmark or favorite | `+4` |
| Outbound click | `+2`, up to three clicks per article (`+6` maximum) |
| Deep read | `+1` when attention bucket is at least three |
| Negative feedback | `-8` |

Each signal ages from its own interaction timestamp with a true half-life:
`weight(age) = 2^(-max(0, ageDays) / halfLifeDays)`. Clicks halve after 30 days,
deep reads after 90, favorites after 365, more-like-this after 730, and
not-interested after 365. There is no permanent minimum multiplier. These are
initial product defaults: incidental clicks fade quickly, reading lasts longer,
and deliberate preferences persist for one or two years before halving.
The raw weights above and capped click count are unchanged.

An article can contain several signals. For example, bookmarking and deeply
reading an article provides stronger evidence than opening it once. Negative
feedback produces signed evidence, allowing RSSMonster to learn that a
semantic area should reduce rather than increase personalized relevance.

Bookmarks are especially clear evidence because they represent an explicit
decision to retain an article. See [Bookmarks]({% link bookmarks.md %}).

## Forming Candidate Islands

RSSMonster groups behavioral article profiles by cosine similarity. The
strongest positive or negative evidence is processed first. An article joins
the closest existing candidate when similarity is at least `0.64` by default.
Otherwise, it starts another candidate until the calibration community limit—ten
by default—is reached. If no candidate qualifies after that, the profile remains
unassigned. Capacity never forces unrelated evidence into a nearby Island. The
community limit is not a hard count of all stored Islands.

Each candidate receives:

- an aggregate vector weighted by the magnitude of its article evidence;
- a signed weight based on average behavior plus a small breadth bonus;
- counts of the signals supporting it; and
- the source articles that explain why it was formed.

The weight is bounded from `-1.0` to `1.0`. Positive weights can boost related
content, while negative weights can penalize it. A weight is a preference
signal, not a quality or truthfulness rating.

The current implementation can create a candidate from one sufficiently
strong vectorized article. Further related behavior makes the Island broader
and more stable over subsequent calibrations.

## Preserving Existing Islands

Candidate profiles are compared with the user's stored Islands. A similarity
of at least `0.78` reuses an existing Island. Its vector is blended with the
new profile using a default new-evidence weight of `0.35`; it is not replaced
abruptly. Stored behavioral counters are replaced by the current evidence
snapshot, so recalibrating unchanged favorites/clicks does not count them again.
Audit entries may record each run but are not new behavioral evidence.

If no Island qualifies, RSSMonster creates a new one. This preference for
updating existing Islands gives them continuity as reading habits evolve.

An Island, including one that still matches an old behavioral profile, can be
archived when both conditions hold:

- its lifecycle confidence from current decayed support is below `0.12`; and
- its latest meaningful supporting interaction is at least 45 days old, or no
  qualifying interaction time remains.

Archived Islands remain available for inspection but are excluded from direct
Island scoring; explicit Article fallback retains its separate existing rules.
They remain candidates for profile matching at the existing
threshold. A strongly supported matching profile with an interaction newer than
`archivedAt` reactivates the same Island ID; recalibrating the same old evidence
does not. For legacy archives without `archivedAt`, support must be strong and
recent (not stale). No historical Island is automatically deleted.

### Behavioral lifecycle

`updatedAt` records technical persistence only. Calibration, vector blending,
renaming and audit writes never supply behavioral activity. `lastBehaviorAt` is
derived during lifecycle evaluation rather than stored as another timestamp.
It is the latest valid, non-future interaction clock on currently meaningful
support, with the existing publication fallback for null legacy clocks. Each
contributing signal and its Article's absolute net evidence must reach the
existing `.05` signal threshold; an exhausted incidental click cannot make an
otherwise old preference look recent.

Lifecycle confidence is separate from scoring confidence:

```
signalRetention = max(decayedSignal / rawSignal)
agreement = abs(decayedPositive - decayedNegative)
            / (decayedPositive + decayedNegative)
remainingSupport = max(signalRetention * agreement)
lifecycleConfidence = existingSupportConfidence * remainingSupport
```

`signalRetention` takes the strongest independently normalized signal whose
decayed contribution reaches the existing `.05` signal threshold. This is its
existing recency multiplier; raw weights and decay are unchanged. An aging click
cannot dilute a surviving favorite, including before that click becomes exhausted.
`agreement` preserves signed cancellation using the full decayed positive and
negative evidence. It is 1 for same-direction evidence and 0 for exact cancellation;
a zero total gives zero agreement. No meaningful signals gives zero retention.

The maximum is over currently qualifying supporting Articles. Empty support gives
zero lifecycle confidence; exhausted Articles do not contribute to support confidence.
Using the strongest remaining fraction prevents a large volume of old weak history
from diluting a surviving deliberate preference. Conflicting evidence can lower
an Article's remaining signed support. The existing recommendation confidence formula is not
changed or multiplied again during scoring.

- **Active:** not archived; recent activity or sufficient decayed support keeps
  the Island eligible for scoring, subject to [active capacity](#active-capacity).
  An old but strongly supported preference can remain active.
- **Stale:** no meaningful interaction within `ISLAND_ARCHIVE_STALE_DAYS`
  (default 45). Staleness alone does not archive a strong preference.
- **Archived:** stale and below `ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD` (default
  `.12`) at calibration, or displaced by the active-capacity policy (duplicate
  archival also remains separate). Matched and unmatched Islands are evaluated;
  the original archive timestamp survives repeated calibration.
- **Reactivated:** an archived Island wins normal profile matching and has
  lifecycle confidence at least `.12` plus a newer meaningful interaction,
  and wins an active-capacity slot.

Matched profiles use their actual supporting Articles. Unmatched active Islands
use the existing nearest-support rule among active Islands. Both reuse the full
owned, canonical, unfiltered Article snapshot already loaded for formation,
including evidence that has decayed below profile eligibility. This avoids a
second history query and avoids mistaking the scoring helper's 500-row evidence
limit for absence of lifecycle support. Archived unmatched Islands need no
support scan. Duplicate-name archival remains a separate existing rule.

Lifecycle updates occur in the existing calibration transaction and replay
checkpoint. A scoring retry reuses the committed lifecycle decision; it neither
rewrites interaction clocks nor resets archival. A new behavior request causes
the existing refresh flow to recalibrate. No new scheduler or deletion task is added.

## Island Names

RSSMonster first tries to label an Island using the nearest active semantic
taxonomy name. When no taxonomy label is available, it uses the strongest source article title.

Names are also disambiguated. Semantically near-identical Islands with the same
normalized name can be archived as duplicates. Distinct Islands that happen to
receive the same broad name are given a distinguishing phrase or suffix rather
than being merged solely because their labels match.

## Population Audit

Each Island keeps a bounded audit history explaining how it was populated.
An audit entry can include:

- contributing article IDs;
- counts of related, bookmarked, clicked, and negatively rated articles; and
- compact snapshots of source-article evidence.

By default, RSSMonster retains the latest 30 calibration entries and up to 300
article IDs per entry. The audit supports the **Why this island exists** view;
it is never fed back into clustering as new semantic evidence.

## Article Interest Scores

After calibration, RSSMonster recalculates interest scores for canonical,
unfiltered, unread articles.

Personalization separates signed preference strength, confidence in the Island's
behavioral support/cohesion, and confidence in the Article's relationship to it.
A coherent singleton remains useful but has lower confidence (0.35) than a coherent
interest supported across multiple articles, sources and interaction days. These
confidence measurements are derived from current bounded evidence, not stored
audit history; diagnostic classifications do not automatically delete Islands.

Direct Article → Island matching requires similarity strictly above the
existing scoring threshold (0.62 by default) and normalizes confidence within the
trusted range. Weak relationships cannot forward full Island preference.

Explicit likes/favorites/dislikes without a qualifying same-sign Island can also
transfer through a bounded behavioral fallback. It uses recent source articles,
semantic confidence and content-intent compatibility. A promotional dislike
transfers much less to a review than to another promotion, even for the same
product. Missing intent conservatively attenuates; unread/no-click/missing engagement
is not negative feedback. Recency uses the corresponding Article interaction timestamp. Publication time
is only a fallback for legacy state with a null interaction timestamp.

The strongest adjusted path wins per Island. Across Islands and explicit evidence,
the strongest positive and strongest negative contributions are added and bounded;
correlated paths do not stack. The internal
[Island scoring reference](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/islands/README.md#confidence-aware-interest)
owns the exact confidence, fallback and aggregation formulas.

No trustworthy path means `interestScore = 0`. Every eligible article still receives
a runtime Recommended score from its other signals; personalization coverage may
be much lower than Recommended coverage. See [Scoring]({% link scoring.md %}).

Interest scores influence `sort:recommended`, where positive scores boost and
negative scores penalize an article. They also support Daily Briefing
eligibility and semantic filtering. The score is derived output: it does not
become new behavioral evidence and does not itself change an Island.

## Inspecting Your Islands

Open **Settings > Islands** for an explanation of what RSSMonster has learned.
The overview itself is read-only and shows:

- the number of active Interest Islands;
- each Island's signed interest weight and active or archived state;
- the behavioral source articles explaining why it exists.

![Interest Island insights in the Settings menu](assets/interestislands.png)

The overview is a snapshot. Use **Refresh** to fetch the latest state without
changing it. **Recalculate Islands** deliberately rebuilds the signed-in user's
Islands from existing evidence and refreshes article interest scores before
reloading the overview.

## Refreshing after behavior

Favorites and unfavorites, more-like-this, not-interested, clicks, and meaningful
reads request a background personalization refresh. A short two-second batching
window combines rapid actions into one job per user. Activity during calibration
requests one follow-up pass. The existing worker recalibrates your Islands and
refreshes scores for your eligible unread articles without waiting for a crawl.

Recommended uses these scores on the next refresh after the job finishes. An
immediate refresh can still show earlier scores. The AI worker must be running;
the SQLite Compose profile does not start it automatically.

### Fast explicit feedback

**More like this** and **Not interested** also request an immediately eligible,
higher-priority scoring job. It uses the article's vector and existing explicit
feedback/Island evidence to refresh related unread recommendations without first
rebuilding Islands. Unrelated candidates retain their scores. The worker must
finish this job before a refresh can show the new results; the HTTP action itself
does not wait for scoring.

The separate, coalesced calibration job still updates durable Island memory.
Favorites remain explicit preference evidence, but favorite/unfavorite, clicks and
deep reads continue using that durable refresh path without the extra fast job.

## Calibration and Normal Crawls

A normal crawl does not rebuild the user's Islands. It assigns Events to new articles, then scores those new unread articles against the
existing active Islands. This keeps routine crawling bounded.

To recalibrate Islands for every user and then refresh article interest
scores, run from the `server` directory:

```bash
npm run islands
```

The historical semantic pipeline also recalibrates Islands after historical Event
backfill:

```bash
npm run semantic:all
```

These operations inspect behavioral history and update semantic relationships,
so run them deliberately on large multi-user libraries.

## Advanced Server Tuning

Most installations should use the defaults. The main controls are:

| Variable | Default | Effect |
| --- | ---: | --- |
| `MAX_INTEREST_ISLANDS` | `20` | Maximum ACTIVE persisted Islands per user; archived history is excluded. Decimal integer 1–1000, otherwise default 20. |
| `ISLAND_ARTICLE_AFFINITY_THRESHOLD` | `0.64` | Similarity needed to group behavioral articles into one candidate. |
| `ISLAND_ARTICLE_SIGNAL_THRESHOLD` | `0.05` | Minimum absolute behavioral score admitted to article clustering. |
| `ISLAND_PROFILE_MATCH_THRESHOLD` | `0.78` | Similarity needed to update an existing Island instead of creating one. |
| `ISLAND_VECTOR_ALPHA` | `0.35` | Weight of new profile evidence when updating an Island vector. |
| `ISLAND_CLICK_HALF_LIFE_DAYS` | `30` | Click half-life, using `lastClickedAt`. |
| `ISLAND_DEEP_READ_HALF_LIFE_DAYS` | `90` | Meaningful-read half-life, using `lastMeaningfulReadAt`. |
| `ISLAND_FAVORITE_HALF_LIFE_DAYS` | `365` | Favorite half-life, using `favoritedAt`. |
| `ISLAND_POSITIVE_FEEDBACK_HALF_LIFE_DAYS` | `730` | More-like-this half-life, using `positiveFeedbackAt`. |
| `ISLAND_NEGATIVE_FEEDBACK_HALF_LIFE_DAYS` | `365` | Not-interested half-life, using `negativeFeedbackAt`. |
| `ISLAND_ARTICLE_SCORE_THRESHOLD` | `0.62` | Direct scoring requires similarity strictly above this threshold; confidence is normalized above it. |
| `ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD` | `0.12` | Minimum decayed lifecycle confidence for stale support to remain active or new support to reactivate an archive. |
| `ISLAND_ARCHIVE_STALE_DAYS` | `45` | Age of the latest meaningful supporting interaction before weak support is eligible for archival. |
| `ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD` | `0.92` | Similarity at which same-name Islands are treated as duplicates. |
| `ISLAND_AUDIT_MAX_RUNS` | `30` | Maximum retained population-audit entries. |
| `ISLAND_AUDIT_MAX_ARTICLE_IDS` | `300` | Maximum stored article IDs per audit entry. |

Island thresholds interact: permissive settings can combine unrelated
interests, while strict settings can create fragmented or sparsely connected
Islands. `ISLAND_DEBUG=true` enables detailed calibration, membership, and
scoring diagnostics. `EVENT_DEBUG=true` also enables Island debug output.

### Interaction time

Favoriting an article published in 2022 today is fresh favorite evidence. Clicks,
favorites, explicit positive/negative feedback and meaningful reads have separate
Article clocks. All signals decay separately before combining; repeated clicks
and deep reads refresh their respective clocks, and unfavorite clears its clock.
Fever/GReader starring uses the same timing semantics. Marking an article read
without a meaningful visible-duration report does not imply a deep read.

The migration does not backfill unknown times with today. Existing null timestamps
fall back to publication time until that signal is recorded again. If neither date
is usable, the existing unknown-age behavior retains multiplier 1; future dates
are capped at age zero. Raw signal weights, explicit fallback windows, intent
handling and final Recommended weights are unchanged.
See [the service contract](../server/services/islands/README.md#interaction-timestamps-and-legacy-behavior).

### Decay examples and configuration migration

The old positive multiplier was `max(.2, exp(-ageDays / 1460))`, making 1460 an
exponential time constant (a true half-life of about 1012 days). Negative evidence
retained 100%. The new percentages below apply to each signal's raw weight:

| Age in days | Old positive | Old negative | Click | Deep read | Favorite | More-like-this | Not-interested |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7 | 99.5% | 100% | 85.1% | 94.8% | 98.7% | 99.3% | 98.7% |
| 30 | 98.0% | 100% | 50.0% | 79.4% | 94.5% | 97.2% | 94.5% |
| 90 | 94.0% | 100% | 12.5% | 50.0% | 84.3% | 91.8% | 84.3% |
| 180 | 88.4% | 100% | 1.6% | 25.0% | 71.0% | 84.3% | 71.0% |
| 365 | 77.9% | 100% | 0.022% | 6.0% | 50.0% | 70.7% | 50.0% |

Percentages are rounded; decay has no hard cutoff.
For example, one 90-day-old click contributes `2 × .125 = .25`, while a
90-day-old favorite contributes about `4 × .843 = 3.37`. A one-year-old dislike
contributes `-8 × .5 = -4` before the existing formation and confidence formulas.

The five settings accept positive finite days, including fractions; invalid or
missing values use their individual defaults. Restart the server/workers after
changing environment configuration. `ISLAND_RECENCY_HALF_LIFE_DAYS` and
`ISLAND_RECENCY_MIN_WEIGHT` are retired and ignored; replace existing overrides
with the per-signal values in [server/.env.example](../server/.env.example).

Decay is evaluated during existing Island calibration, followed by unread scoring.
It is not a new periodic scheduler or a per-request recalculation of persisted
scores. Archival uses the behavioral lifecycle described above. The immediate
explicit fallback intentionally keeps its separate 30-day half-life and 90-day
window; durable Island memory is not forced into that shorter response window.


## Active capacity

`MAX_INTEREST_ISLANDS` means the maximum simultaneously **active persisted**
Interest Islands for one user, default **20**. Unset, invalid, non-integer, zero,
negative, non-finite, partial numeric strings and values above the operational
ceiling of 1000 fall back to 20. Parsing is decimal: `20` means 20, `30` means 30.
The previous `parseInt(value, 20)` treated 20 as a radix, not a fallback.

After profile matching, creation, normal lifecycle archival and duplicate-name
handling, persistence selects at most this many active Islands in the same
transaction. It includes retained unmatched active Islands, not just this run's
profiles. The user row is locked before the persistence read/write sequence;
SQLite uses an immediate transaction. Concurrent calibrations cannot each claim
a separate last active slot. Enforcement occurs on calibration, not by a schema
constraint or a background migration of every existing user.

Selection is lexicographic, in this exact order:

1. Absolute **current reconstructed profile weight**, descending, using the existing
   `clamp(meanSignedEvidence / 7 + signedBreadthBonus, -1, 1)` and its four-decimal rounding.
2. Current lifecycle confidence, descending, rounded to four decimals to avoid
   floating-point noise deciding the active set.
3. Number of currently qualifying supporting Articles, descending.
4. Latest meaningful supporting interaction, descending; unknown age sorts last.
5. Stable Island ID, ascending.

Matched candidates use their profile's owned Article IDs. Unmatched retained
Islands use the existing nearest-support assignment and affinity threshold.
Both reconstruct decayed signals from the same complete behavioral snapshot,
applying the existing Article signal cutoff; an obsolete stored weight cannot
win a slot without current support. Absolute weight treats strong negative and
positive preferences equally. No scoring multiplier, decay or similarity
threshold changes. Stable ties and existing archive/reactivation rules prevent
replay from arbitrarily exchanging equally supported Islands.

Overflow becomes archived/dormant; nothing is deleted and IDs, vectors and audit
history are preserved. A new strong profile or a qualifying archived match can
win a slot, displacing weaker support. Reactivation still requires sufficient
lifecycle confidence and new meaningful behavior after archival, and must win
capacity under the same ordering. A weaker returning profile stays dormant.
Matching archived Islands precedes creation, so a returning match reuses its ID.
An archived Island never consumes an active slot.

Formation retains the existing bounded pass: at most the same configured number
of candidate communities are formed, in the existing magnitude/ID order. This is
an additional processing bound, **not** the enforcement of active capacity. It
keeps the existing clustering cost bounded and avoids changing memberships or
forcing below-threshold matches. Unassigned behavior can therefore remain even
when historical Islands exist; this change does not attempt globally optimal
selection across every possible community. Persistence separately reconciles
those candidates with retained active history and enforces the actual cap.
Internal `maxIslands` options may lower both bounds but cannot exceed the configured
maximum. No second environment option is needed for this conservative policy.
