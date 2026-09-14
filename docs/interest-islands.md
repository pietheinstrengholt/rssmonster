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

Positive signals are reduced gradually as articles age. The default half-life
is 1,460 days, with a minimum recency multiplier of `0.2`, so older explicit
behavior remains useful without carrying its original strength forever.

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

An unmatched Island can be archived when both conditions hold:

- its confidence derived from current behavioral support is below `0.12`; and
- it has not been updated for at least 45 days.

Archived Islands remain available for inspection but are excluded from active
article matching and interest scoring. A later matching profile can reactivate
an archived Island.

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
interest supported across multiple articles, sources and publication days. These
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
is not negative feedback. Publication time is a recency proxy because feedback
interaction timestamps are unavailable for this path.

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

Use `island:true` in Search or a Smart Folder to select articles whose vectors match an active Island, independently
of Event membership or signed preference. `island:false`
selects articles without such a relationship. See [Search]({% link search.md %}) and
[Smart Folders]({% link smart-folders.md %}).

## Inspecting Your Islands

Open **Settings > Islands** for an explanation of what RSSMonster has learned.
The overview itself is read-only and shows:

- the number of active Interest Islands;
- articles directly matching active Islands;
- articles outside Islands and overall library coverage;
- each Island's signed interest weight and active or archived state;
- the behavioral source articles explaining why it exists; and
- recently related articles.

![Interest Island insights in the Settings menu](assets/interestislands.png)

The overview is a snapshot. Use **Refresh** to fetch the latest state without
changing it. **Recalculate Islands** deliberately rebuilds the signed-in user's
Islands from existing evidence and refreshes article interest scores before
reloading the overview. Low coverage is not automatically a problem: Islands
are based on explicit behavior and conservative semantic relationships, so
most of a large library may remain outside them.

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
| `MAX_INTEREST_ISLANDS` | `10` | Maximum behavioral communities formed for each user. |
| `ISLAND_ARTICLE_AFFINITY_THRESHOLD` | `0.64` | Similarity needed to group behavioral articles into one candidate. |
| `ISLAND_ARTICLE_SIGNAL_THRESHOLD` | `0.05` | Minimum absolute behavioral score admitted to article clustering. |
| `ISLAND_PROFILE_MATCH_THRESHOLD` | `0.78` | Similarity needed to update an existing Island instead of creating one. |
| `ISLAND_VECTOR_ALPHA` | `0.35` | Weight of new profile evidence when updating an Island vector. |
| `ISLAND_RECENCY_HALF_LIFE_DAYS` | `1460` | Half-life for positive behavioral evidence. |
| `ISLAND_RECENCY_MIN_WEIGHT` | `0.2` | Minimum retained multiplier for old positive behavior. |
| `ISLAND_ARTICLE_SCORE_THRESHOLD` | `0.62` | Direct scoring requires similarity strictly above this threshold; confidence is normalized above it. |
| `ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD` | `0.12` | Low-confidence condition for archiving an inactive Island. |
| `ISLAND_ARCHIVE_STALE_DAYS` | `45` | Minimum inactive age before low-confidence archival. |
| `ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD` | `0.92` | Similarity at which same-name Islands are treated as duplicates. |
| `ISLAND_AUDIT_MAX_RUNS` | `30` | Maximum retained population-audit entries. |
| `ISLAND_AUDIT_MAX_ARTICLE_IDS` | `300` | Maximum stored article IDs per audit entry. |

Island thresholds interact: permissive settings can combine unrelated
interests, while strict settings can create fragmented or sparsely connected
Islands. `ISLAND_DEBUG=true` enables detailed calibration, membership, and
scoring diagnostics. `EVENT_DEBUG=true` also enables Island debug output.
