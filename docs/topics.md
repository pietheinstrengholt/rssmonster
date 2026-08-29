---
layout: page
title: Topics
parent: How RSSMonster Works
nav_order: 5
---

# Topics

Topics connect related [Events](events.md) into recurring subjects. An Event
answers **what happened?** A Topic answers **what recurring subject does this
belong to?**

For example, separate Events about a product announcement, a company
acquisition, and a regulatory decision might all contribute to a broader
Topic about that company or technology.

Topics are deliberately broader and longer-lived than Events. They are not
feeds, categories, individual stories, or personal-interest profiles.
[Interest Islands](interest-islands.md) form the separate, user-specific layer
that models what someone consistently cares about.

## Where Topics Fit

```text
Articles
   |
   v
Events: individual real-world stories
   |
   v
Topics: recurring subjects across stories
   |
   v
Interest Islands: durable personal interests
```

Topic assignment normally follows Event creation in the post-crawl semantic
pipeline. RSSMonster uses the Event's aggregate vector rather than clustering
raw articles directly at this layer.

Not every Event receives a Topic, and not every possible subject becomes a
Topic. Leaving an Event unassigned is valid when the available evidence is too
weak.

## Topic Types

The data model supports three Topic types.

### Event Topics

Event Topics connect recurring news Events. These are the Topics created and
maintained by the normal post-crawl and historical semantic pipelines.

They are created conservatively so that every isolated Event does not become
its own permanent Topic.

### Behavioral Topics

Behavioral Topics describe communities of semantically related articles with
repeated positive engagement. The behavioral calibration service considers:

- bookmarks or favorites;
- outbound article clicks, capped at three clicks per article; and
- deep reads with an attention bucket of at least three.

Bookmarks contribute `4` evidence points, each counted click contributes `2`
up to a maximum of `6` per article, and a deep read contributes `1`. A
behavioral community must currently contain at least three articles, reach a
combined score of at least `8`, and span at least two feeds or two calendar
days. This prevents a single click or one reading session from creating durable
Topic memory.

Behavioral Topics link directly to their evidence articles. They never own
Events and are excluded from Event-to-Topic matching.

The behavioral calibrator exists as a separate semantic service. It is not
currently invoked by the normal crawl, `npm run topics`, or
`npm run semantic:all` commands.

### Hybrid Topics

Hybrid Topics are designed to carry both Event and behavioral evidence. The
Event assignment service may match Events to existing Event or hybrid Topics,
and behavioral calibration preserves existing hybrid Topics when refreshing
their behavioral evidence.

The current services do not automatically convert an Event Topic or a
Behavioral Topic into a hybrid Topic. Hybrid is a supported persisted type for
combined semantic evidence, rather than a transition performed by the normal
crawl pipeline today.

## Matching an Event to Topics

When an Event has a usable vector, RSSMonster compares it with the vectors of
the user's existing Event and hybrid Topics using cosine similarity.

The matches are ranked by confidence:

- a similarity of at least `0.76` can become the primary Topic;
- a similarity of at least `0.62` can become a secondary Topic; and
- at most five Topic assignments are retained.

An Event can therefore belong to several related Topics while having one
primary Topic for efficient grouping. During non-incremental repair or rebuild
processing, RSSMonster adds a small amount of threshold hysteresis to reduce
unstable assignments near a boundary.

A lower identity threshold of `0.50` lets RSSMonster recognize and reuse an
existing semantic region even when it does not qualify as a normal secondary
match. This favors durable Topic identity over repeatedly creating similar
Topics.

Pure Behavioral Topics are intentionally excluded from these comparisons, so
personal engagement clusters cannot take ownership of news Events.

## Creating a New Event Topic

If no existing Topic can be reused, RSSMonster gathers up to 300 recent,
unassigned Events whose vectors resemble the current Event. A new Topic is
created only when a conservative evidence gate passes.

The default gate accepts one of these kinds of evidence:

- at least two similar seed Events or at least three supporting articles,
  provided the current Event itself contains at least two articles;
- a non-archived Event with at least two articles, two sources, an Event
  strength of at least `0.35`, and a meaningful name; or
- a two-article Event with sufficient identity similarity and repeated named
  evidence in its titles.

If none of these conditions is met, the Event remains without a Topic. This is
expected and helps avoid a fragmented collection of one-off Topics.

## Topic Names

Topic names are generated deterministically from Event names and supporting
article titles. The naming service looks for useful repeated phrases and named
terms, removes generic news wording and duplicate ideas, and produces a compact
label.

Names are derived from stored content rather than generated through a separate
chat-model request. A safe fallback is used when no meaningful label can be
found.

## Stable Identity and Vector Evolution

Each Topic stores an aggregate vector and a stable key derived from that
vector. Existing Topics are preferred over creating replacements, preserving
semantic memory as new Events arrive.

Event-topic vector drift is disabled by default. When explicitly enabled,
only incremental assignment may move a Topic vector, and it moves gradually
toward qualifying evidence. Repair and full-rebuild scopes do not drift Topic
vectors. Behavioral Topic updates use their own weighted vector blending so
one new article does not abruptly replace the existing profile.

## Primary and Secondary Membership

The authoritative relationships are stored separately:

- `EventTopic` records an Event's ranked Topic memberships and confidence;
- `ArticleTopic` records the corresponding article memberships and behavioral
  evidence links.

The `topicId` field on an Event or Article is only a cached reference to its
primary Topic. When an Event's assignments change, RSSMonster synchronizes the
Event memberships to its canonical articles.

Topic statistics such as Event count, article count, and last activity are
derived from these relationships. They are summaries rather than independent
membership records.

All Topics and relationships are scoped to one user. Different users can
develop different Topic collections from their own subscriptions and history.

## Viewing Topics

When AI-backed features are available, select **Topics** from the **Grouping**
control. The main list shows one representative article for each primary
Topic, selected from the strongest Event in that Topic. If equally strong
Events exist, RSSMonster uses a deterministic Event tie-breaker.

The **similar articles** label represents the articles across the Topic's
Events. Select it to expand that related coverage below the representative,
and select it again to collapse the group.

Topic grouping currently uses primary Event Topics. Secondary and purely
behavioral memberships remain semantic evidence but do not independently
create cards in this grouped view.

When a Topic-grouped card is marked read, RSSMonster marks the canonical
articles across Events with that same primary Topic as read. Use ungrouped mode
when reading state should be changed for only one article.

## Inspecting Topic Health

The read-only **Settings > Topics** view displays Topic coverage and recent
semantic records alongside Event health. It includes the number of Topics,
Topics with Events, Events without Topics, linked articles, average Events per
Topic, Topic types, and recent Topic statistics.

![The Events and Topics operational overview in Settings](assets/events.png)

Low Topic coverage is not necessarily an error. Topic creation is intentionally
conservative, and one-off Events should not be forced into permanent subjects.

## Advanced Server Tuning

Most installations should keep the defaults. These environment variables tune
Event-topic matching and creation:

| Variable | Default | Effect |
| --- | ---: | --- |
| `TOPIC_IDENTITY_THRESHOLD` | `0.50` | Similarity at which an existing Topic identity can be reused. |
| `PRIMARY_TOPIC_THRESHOLD` | `0.76` | Similarity required for primary membership. |
| `SECONDARY_TOPIC_THRESHOLD` | `0.62` | Similarity required for secondary membership. |
| `MAX_TOPICS_PER_ARTICLE` | `5` | Maximum ranked Topic memberships retained for an Event and its articles. |
| `TOPIC_MIN_EVENTS_FOR_CREATION` | `2` | Similar seed Events sufficient for the normal creation gate. |
| `TOPIC_MIN_ARTICLES_FOR_CREATION` | `3` | Supporting article count sufficient for the normal creation gate. |
| `TOPIC_MIN_STRONG_EVENT_ARTICLES` | `2` | Minimum articles in the strong-Event creation path. |
| `TOPIC_MIN_STRONG_EVENT_SOURCES` | `2` | Minimum distinct feeds in the strong-Event creation path. |
| `TOPIC_MIN_STRONG_EVENT_STRENGTH` | `0.35` | Minimum strength in the strong-Event creation path. |
| `TOPIC_VECTOR_DRIFT_ENABLED` | `false` | Allows gradual Event-topic vector movement during incremental processing. |
| `TOPIC_VECTOR_DRIFT_ALPHA` | `0.03` | Limits how far an enabled drift update moves toward new Event evidence. |
| `TOPIC_VECTOR_DRIFT_MAX_SIMILARITY` | `0.92` | Prevents drift outside the configured qualifying similarity range. |

The separate behavioral calibration service uses:

| Variable | Default | Effect |
| --- | ---: | --- |
| `BEHAVIORAL_TOPIC_COMMUNITY_SIMILARITY_THRESHOLD` | `0.64` | Similarity needed to place engaged articles in one behavioral community. |
| `BEHAVIORAL_TOPIC_MATCH_THRESHOLD` | `0.78` | Similarity needed to reuse an existing Behavioral or hybrid Topic. |
| `BEHAVIORAL_TOPIC_ENGAGEMENT_THRESHOLD` | `8` | Minimum combined positive engagement evidence. |
| `BEHAVIORAL_TOPIC_VECTOR_ALPHA` | `0.35` | Weight given to new evidence when updating a behavioral vector. |

Thresholds interact. Lowering them can merge unrelated subjects, while raising
them can fragment one subject across several Topics. `TOPIC_DEBUG=true` enables
creation-gate diagnostics; `EVENT_DEBUG=true` also enables Topic debug output.

## Rebuilding Event Topics

To rebuild Event and hybrid Topic relationships for every user:

```bash
cd server
npm run topics
```

To limit the operation to one user:

```bash
npm run topics -- --userId=3
```

The wider historical semantic pipeline also runs the Topic rebuild:

```bash
npm run semantic:all
```

The Topic rebuild clears and recalculates Event and hybrid Topic relationships,
then refreshes their derived statistics. It leaves Behavioral Topics intact
because those are maintained by the separate calibration service. Run rebuilds
deliberately on large libraries because they perform substantial database and
semantic work.
