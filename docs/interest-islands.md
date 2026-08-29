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
is not an [Event](events.md), a [Topic](topics.md), a feed category, or simply a
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
Enrich them with Topics
        |
        v
Score unread articles
```

Events describe individual occurrences. Topics connect recurring subjects.
Interest Islands consume those semantic layers together with direct behavior,
but never redefine them.

## Behavioral Evidence

Island calibration starts with canonical, vectorized articles that carry an
explicit behavioral signal. The current signal weights are:

| Signal | Contribution |
| --- | ---: |
| Positive feedback | `+4` |
| Bookmark or favorite | `+4` |
| Outbound click | `+1.5`, up to three clicks per article |
| Deep read | `+3` when attention bucket is at least three |
| Negative feedback | `-4` |

Positive signals are reduced gradually as articles age. The default half-life
is 1,460 days, with a minimum recency multiplier of `0.2`, so older explicit
behavior remains useful without carrying its original strength forever.

An article can contain several signals. For example, bookmarking and deeply
reading an article provides stronger evidence than opening it once. Negative
feedback produces signed evidence, allowing RSSMonster to learn that a
semantic area should reduce rather than increase personalized relevance.

Bookmarks are especially clear evidence because they represent an explicit
decision to retain an article. See [Bookmarks](bookmarks.md).

## Forming Candidate Islands

RSSMonster groups behavioral article profiles by cosine similarity. The
strongest positive or negative evidence is processed first. An article joins
the closest existing candidate when similarity is at least `0.64` by default.
Otherwise, it starts another candidate until the per-user maximum—ten Islands
by default—is reached. After that, remaining evidence is assigned to its
nearest candidate.

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
abruptly.

If no Island qualifies, RSSMonster creates a new one. This preference for
updating existing Islands gives them continuity as reading habits evolve.

An unmatched Island can be archived when both conditions hold:

- its average Topic-membership confidence is below `0.12`; and
- it has not been updated for at least 45 days.

Archived Islands remain available for inspection but are excluded from active
article matching and interest scoring. A later matching profile can reactivate
an archived Island.

## Topic Enrichment

After behavior-derived Islands are persisted, RSSMonster evaluates stored
Topics. Topics help an Island expand beyond its original source articles while
remaining connected to explainable semantic subjects.

Topic profiles combine:

- positive and negative behavior on Topic articles;
- the Topic's stored affinity;
- bounded Event-count evidence;
- overlap in the engaged articles; and
- similarity in the time periods when engagement occurred.

Behavioral affinity, rather than vector similarity alone, groups Topics into
candidate communities. Existing Islands are then enriched with Topics whose
vectors reach a similarity of `0.62` and whose evidence-adjusted confidence
reaches `0.10` by default.

Topics enrich existing behavior-derived Islands; they do not independently
create the initial personal-interest layer.

## Evolving Topic Membership

`IslandTopic` is the durable relationship between an Island and a Topic. It
stores both semantic similarity and evidence-adjusted confidence.

When evidence is observed again, old and new membership values are blended.
The default blend gives new evidence a weight of `0.65`. Memberships not
observed in the latest calibration decay to `82%` of their previous confidence
instead of disappearing immediately. They are removed only after confidence
falls below `0.05`.

This gradual evolution prevents a small change in reading behavior from
reorganizing the user's long-term interests all at once.

## Island Names

RSSMonster first tries to label an Island using the nearest active semantic
taxonomy name. When no taxonomy label is available, it uses the strongest
related Topic names or, for article-only evidence, the strongest source
article title.

Names are also disambiguated. Semantically near-identical Islands with the same
normalized name can be archived as duplicates. Distinct Islands that happen to
receive the same broad name are given a distinguishing phrase or suffix rather
than being merged solely because their labels match.

## Population Audit

Each Island keeps a bounded audit history explaining how it was populated.
An audit entry can include:

- contributing Topic and article IDs;
- counts of related, bookmarked, clicked, and negatively rated articles; and
- compact snapshots of source-article evidence.

By default, RSSMonster retains the latest 30 calibration entries and up to 300
article IDs per entry. The audit supports the **Why this island exists** view;
it is never fed back into clustering as new semantic evidence.

## Article Interest Scores

After calibration, RSSMonster recalculates interest scores for canonical,
unfiltered, unread articles.

The preferred scoring path is:

```text
Article -> Topic -> Interest Island weight
```

If an article belongs to several active Islands through its Topics, RSSMonster
uses the Island weight with the greatest absolute magnitude. This preserves a
strong negative preference as well as a strong positive one.

When an article has no applicable Topic path, RSSMonster can compare its vector
directly with active Island vectors. The fallback requires similarity of at
least `0.62` by default and calculates:

```text
interest score = Island weight x vector similarity
```

The vector fallback replaces an existing score only when its absolute strength
is greater. Topic-based scoring is preferred because it is more stable and
easier to explain.

Interest scores influence `sort:recommended`, where positive scores boost and
negative scores penalize an article. They also support Daily Briefing
eligibility and semantic filtering. The score is derived output: it does not
become new behavioral evidence and does not itself change an Island.

Use `island:true` in Search or a Smart Folder to select articles whose Event
has a primary or secondary Topic linked to an active Island. `island:false`
selects articles without such a relationship. See [Search](search.md) and
[Smart Folders](smart-folders.md).

## Inspecting Your Islands

Open **Settings > Islands** for an explanation of what RSSMonster has learned.
The overview itself is read-only and shows:

- the number of active Interest Islands;
- articles connected to active Islands through Topics;
- articles outside Islands and overall library coverage;
- each Island's signed interest weight and active or archived state;
- the behavioral source articles explaining why it exists; and
- linked Topics and recently related articles.

![Interest Island insights in the Settings menu](assets/interestislands.png)

The overview is a snapshot. Use **Refresh** to fetch the latest state without
changing it. **Recalculate Islands** deliberately rebuilds the signed-in user's
Islands from existing evidence and refreshes article interest scores before
reloading the overview. Low coverage is not automatically a problem: Islands
are based on explicit behavior and conservative semantic relationships, so
most of a large library may remain outside them.

## Calibration and Normal Crawls

A normal crawl does not rebuild the user's Islands. It assigns Events and
Topics to new articles, then scores those new unread articles against the
existing active Islands. This keeps routine crawling bounded.

To recalibrate Islands for every user and then refresh article interest
scores, run from the `server` directory:

```bash
npm run islands
```

The historical semantic pipeline also recalibrates Islands after rebuilding
Events and Topics:

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
| `ISLAND_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD` | `0.62` | Semantic similarity needed for Topic enrichment. |
| `ISLAND_TOPIC_CONFIDENCE_THRESHOLD` | `0.10` | Minimum evidence-adjusted Topic membership confidence. |
| `ISLAND_MEMBERSHIP_BLEND` | `0.65` | New-evidence share when refreshing Topic memberships. |
| `ISLAND_MEMBERSHIP_DECAY` | `0.82` | Confidence retained for an unobserved membership. |
| `ISLAND_MEMBERSHIP_MIN_CONFIDENCE` | `0.05` | Membership confidence below which a link is removed. |
| `ISLAND_ARTICLE_SCORE_THRESHOLD` | `0.62` | Similarity required by direct article-vector fallback scoring. |
| `ISLAND_ARCHIVE_CONFIDENCE_THRESHOLD` | `0.12` | Low-confidence condition for archiving an inactive Island. |
| `ISLAND_ARCHIVE_STALE_DAYS` | `45` | Minimum inactive age before low-confidence archival. |
| `ISLAND_DUPLICATE_NAME_SIMILARITY_THRESHOLD` | `0.92` | Similarity at which same-name Islands are treated as duplicates. |
| `ISLAND_AUDIT_MAX_RUNS` | `30` | Maximum retained population-audit entries. |
| `ISLAND_AUDIT_MAX_ARTICLE_IDS` | `300` | Maximum stored article IDs per audit entry. |

Additional Topic-community controls include
`ISLAND_TOPIC_AFFINITY_THRESHOLD` (`0.12`),
`ISLAND_MAX_COMMUNITIES_PER_TOPIC` (`2`),
`ISLAND_ENGAGEMENT_TIME_BUCKET_HOURS` (`12`), and
`ISLAND_TEMPORAL_AFFINITY_WEIGHT` (`0.65`).

Island thresholds interact: permissive settings can combine unrelated
interests, while strict settings can create fragmented or sparsely connected
Islands. `ISLAND_DEBUG=true` enables detailed calibration, membership, and
scoring diagnostics. `EVENT_DEBUG=true` also enables Island debug output.
