# Event system

RSSMonster event clustering groups genuinely similar articles into shared events while leaving standalone articles eventless.

## Core Principles
Do not create one-article events.
Articles must only receive an eventId when there is at least one genuinely similar article.
Standalone articles must keep eventId = null.
Event assignment must be order-independent: similar articles should cluster correctly regardless of crawl order, publication order, or incremental run timing.
Existing clustered articles must be allowed to act as corroborating evidence for new articles.
Event clustering must use semantic similarity plus supporting signals, not URL/title matching alone.
Event/article embedding cosine similarity
Event process stands alone from other article processing (e.g., scoring, deduplication, etc.) and should not depend on any other article processing results.

## High level process
Load all recent candidate articles into memory. Use the EVENT_MAX_GAP_HOURS to determine the time window for candidate events.
Load all recent candidate events into memory.
Run the assignment flow for each article, updating the in-memory event cache as articles are assigned to events.
Update the event vector and other event metadata whenever an article joins an event or a new event is created. Such as representativeArticleId for the strongest article in the event, eventWindowStartAt and eventWindowEndAt for the earliest and latest article in the event, sourceCount and sourceDiversityScore for the number of unique sources and their diversity, and lifecycle status for the current state of the event.
Log one concise line whenever an article joins an event or a new event is created.
Summarize the event clustering results at the end of the run, including the number of new events created, the number of articles assigned to existing events, and any articles that remain eventless.

## Assignment Flow
For each article:

Ensure the article has a usable event embedding.
Search recent candidate events within the configured event time window.
If a sufficiently similar existing event is found, attach the article to that event.
If no event match is found, search recent candidate articles within the event time window.
Candidate article search must include both:
unassigned articles where eventId = null
already assigned articles where eventId != null
If similar assigned candidates mostly point to an existing event, attach the article to that event.
If enough similar unassigned candidates exist, create a new event from those candidates plus the current article.
If neither condition is met, leave the article eventless.

## Event Update Rules
When an article joins an existing event:

set the article’s eventId
update the event vector
update articleCount
update eventWindowStartAt and eventWindowEndAt
update lifecycle status
update sourceCount and sourceDiversityScore
keep in-memory event cache values consistent with persisted values

## Expected Behavior
Three near-identical articles from the same publisher should become one event:

A arrives -> no similar article yet -> eventId remains null
B arrives -> similar to A -> create event A+B
C arrives -> similar to A/B -> join existing event

A unique standalone article should remain eventless:

A arrives -> no accepted similar candidates -> eventId remains null

## Cache window
The caches only exist for the lifetime of a clustering run (npm run crawl, npm run cluster, replay, etc.). They are not persisted and are rebuilt at the start of every run.

Use:

EVENT_MAX_GAP_HOURS = 24; + buffer (2 hours)

## EventCache
Load only events whose window overlaps:

EVENT_MAX_GAP_HOURS + buffer (2 hours)

Store:

{
    id,
    articleCount,
    eventVector,
    eventWindowStartAt,
    eventWindowEndAt,
    topicId,
    sourceCount
}

Update the cache immediately after:

article joins event
new event created
event vector changes

Do not retain old archived events.

## ArticleCandidateCache

Store only fields required for matching:

{
    id,
    userId,
    feedId,
    eventId,
    title,
    description,
    published,
    createdAt,
    normalizedEventVector,
    tokenSet,
    entitySet
}

Requirements:

Normalize vectors once when inserted.
Store token/entity sets once.
Never recompute them during matching.
Support:
cache.findNearby(article)
cache.insert(article)
cache.update(article)
cache.removeExpired()

Candidate lookup should only perform an in-memory timestamp comparison.

No database query should occur during normal article matching.

## Assignment flow

For every article:

Search EventCache
↓
If matching event found
↓
Join event
↓
Else search ArticleCandidateCache
↓
If similar assigned articles exist
↓
Join their event
↓
Else if enough similar unassigned articles exist
↓
Create new event
↓
Else

Remain eventless

## Reclustering
for reclustering and replay/rebuild operations.

Keep:

RECENCY_WINDOW_DAYS = 7

only for:

reclusterForUser()
retrospectiveClusterForUser()

These are repair/replay commands.

It currently loads all articles from the last RECENCY_WINDOW_DAYS, clears their event links, removes empty events, and rebuilds clustering for that window.

## Vector optimization

Normalize vectors once when entering the cache.

Similarity should become:

dotProduct(normalizedA, normalizedB)

instead of repeatedly calculating cosine norms.

Never normalize vectors inside the matching loop.

## Development logging

When

NODE_ENV === 'development'

or

EVENT_DEBUG === true

log one concise line whenever an article joins an event.

Example:

[EVENT] article=421 → event=18 sim=0.942 head=0.71 temp=0.98 overlap=2 existing

When creating a new event:

[EVENT] new-event=52 article=421 corroborated=3 avgSim=0.934 sources=2

Keep logging concise.

Never print vectors.