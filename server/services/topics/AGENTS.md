# Topic system

Topics are the semantic layer above Events. A topic is broader and longer-lived instance. A Topic represents a broader recurring subject that multiple events can belong to. Topics are intentionally much more stable than Events. Topics are intentionally conservative. The default behavior is not to create a new topic. A new topic is only created when there is sufficient evidence that the event represents a broader recurring semantic subject rather than a one-off news story.

## Topic types

1. Event topics

Built automatically from Event vectors.

Purpose:

Group related Events into broader semantic themes.
Improve discovery across multiple news stories.
Allow users to follow evolving subjects instead of only individual events.

These topics are created and updated automatically.

2. Behavioral topics

Built from explicit user behavior.

Signals include:

Starred articles
Clicked articles
Deeply read articles

Purpose:

Learn long-term user interests.
Support personalization and recommendations.
Capture interests independently from current news events.

Behavioral topics never determine event ownership.

## Event topics

Event is created or updated
↓
Assign event to topic
↓
Compare event vector with existing event/hybrid topics
↓
If topic match exists:
    updates activity/vector
↓
If no topic match exists:
    checks topic creation gate
↓
If gate passes:
    create new event topic
↓
persists EventTopic rows
↓
Event.topicId is updated
↓
ArticleTopic rows are synced for articles in the event

## Behavioral topics

services/topics/behavioral/

This folder handles topics created from user behavior.

Find articles user engaged with
↓
Score behavior
    starred
    clicked
    deep-read
↓
Cluster engaged article vectors into communities
↓
Require enough evidence
    minimum articles
    minimum engagement score
    multiple feeds or days
↓
Match community to existing behavioral/hybrid topic
↓
Create or update behavioral topic
↓
Persist ArticleTopic rows
↓
Clean stale behavioral links

## Hybrid topics
   Built from both event and behavioral evidence.
   Purpose: bridge event and behavioral topics, but not steal event ownership.

## Topic Creation Gate

A new Event Topic is created only when one of the following conditions is satisfied.

Seed evidence

The Event is supported by enough similar Events and/or articles.

Examples:

Multiple related Events already exist.
Several articles corroborate the same semantic subject.
Strong Event

A single Event may become a Topic when it is already sufficiently important.

Typical indicators include:

multiple articles
multiple independent sources
sufficient event strength
meaningful event title
not archived

## Topic Updates

Existing Topics are never recreated.

Instead they are updated.

Updates include:

refreshing last activity timestamp
optional semantic vector drift
updating EventTopic relationships
updating ArticleTopic relationships
recomputing denormalized statistics

This allows Topics to evolve slowly while remaining semantically stable.

## Repeated Entity

Small Events may still become Topics when repeated named entities strongly indicate an emerging subject.

Example:

Multiple Events referring to the same company or person.

## Important distinction

Event topics answer:

“What broader news theme does this event belong to?”

Behavioral topics answer:

“What subjects does this user seem interested in?”

They share the Topic table, but they should stay separate in code because their evidence model is different.

## Important Principle

Not every Event should become a Topic.

Most Events are temporary and occur only once.

Creating a Topic for every Event would quickly fill the system with thousands of low-value topics.

Instead, Topics should emerge only when sufficient evidence exists that a broader recurring subject is present.

## Design principles
Events are short-lived.
Topics are long-lived.
Not every Event deserves a Topic.
Topic creation is conservative.
Existing Topics are preferred over creating new ones.
Topic vectors drift slowly to preserve semantic identity.
Behavioral Topics and Event Topics are independent systems that share the same Topic model.