---
layout: page
title: Semantic Services Implementation
parent: How RSSMonster Works
nav_order: 9
---

# Semantic Services Implementation

This guide maps the semantic workflow to the server services that implement it.
For the reader-facing concepts, start with [Events]({% link events.md %}), [Topics]({% link topics.md %}),
and [Interest Islands]({% link interest-islands.md %}). Those pages also document their
configuration thresholds; this page focuses on service boundaries and debugging.

## Processing order

The crawl worker owns the critical sequence:

```text
entry extraction and normalization
  → publisher identity, revisions, duplicate/filter handling, persistence
  → article embeddings
  → event assignment and reconciliation
  → topic assignment
  → island scoring
```

A feed item filter can reject an entry before identity lookup; an Action can
store an entry as filtered. These are different paths. Deterministic identity
is resolved before semantic matching, and missing semantic evidence must not
turn unrelated articles into duplicates.

Optional article analysis and generated labels use the durable `processing_jobs`
queue. The AI worker can finish summaries, inferred tags, scores, and display
labels after the article or semantic target exists. It does not own the critical
embedding → event → topic sequence. See [How RSSMonster Works]({% link how-rssmonster-works.md %})
for the full worker topology and article-analysis states.

## Service map

Paths below are relative to `server/services/`.

| Area | Entry points and supporting modules | Responsibility |
| --- | --- | --- |
| Embeddings | `articles/embedArticle.js`, `articles/embedArticles.js` | Build article representations and obtain/store vectors. |
| Event assignment | `events/assignArticleToEvent.js`, `events/ArticleEventCandidateCache.js` | Evaluate bounded article/event candidates with semantic and supporting evidence. |
| Event maintenance | `events/createEvents.js`, `events/updateEvents.js`, `events/eventReconciliation.js` | Coordinate event processing and reconcile existing groups. |
| Event presentation | `events/eventProjection.js`, `events/developingArticlePointer.js` | Maintain event projections and developing-article selection. |
| Event/topic links | `events/eventArticleTopicSync.js`, `topics/event/eventTopicAssignment.js` | Keep article and event topic memberships consistent. |
| Topic matching | `topics/event/assignEventToTopic.js`, `createTopics.js`, `updateTopic.js` in the same directory | Assign event-shaped semantic units to event/hybrid topics and update topic memory. |
| Behavioral topics | `topics/behavioral/calibrateBehavioralTopics.js` | Calibrate themes from engagement evidence. |
| Topic helpers | `topics/shared/topicHelpers.js`, `topicName.service.js`, `topicStats.service.js` in the same directory | Shared identity, naming, and aggregate calculations. |
| Island calibration | `islands/runIslandCalibration.js` | Coordinate behavioral profiles, persistence, membership evolution, audit, and article scoring. |
| Island profiles | `islands/islandArticleProfiles.js`, `islandTopicProfiles.js` in the same directory | Build article-driven interests and topic enrichment profiles. |
| Island state | `islands/islandPersistence.js`, `islandMemberships.js`, `islandAudit.js` | Preserve identity, evolve memberships, and record bounded population audits. |
| Personal scoring | `score/scoreArticlesFromIslands.js` | Project island evidence into article interest scores. |
| Generated labels | `semanticLabels/semanticLabelJobs.js`, `semanticLabels/semanticLabeling.js` | Queue and produce optional semantic display labels. |
| Optional jobs | `jobs/processingJobQueue.js`, `jobs/handlers/`, `jobs/crawlPriorityLease.js` | Claim, execute, retry, and guard background work. |

`config/semanticConfig.js` centralizes semantic granularity and many matching
thresholds. Some services have additional environment-driven controls; consult
the feature-specific tuning tables before changing them.

## Stored relationships

Articles can be eventless; `eventId` is not a promise that every article belongs
to a story. An event groups a specific occurrence, while topic membership can
connect broader themes. Ranked `article_topics` and `event_topics` links preserve
multiple memberships alongside denormalized primary-topic fields.

Interest Islands are user-specific preference profiles. Their `island_topics`
links enrich those profiles, but interests are not built exclusively from topic
clusters: article engagement is a direct input. Strong personal interest does
not prove event identity or duplicate content.

Vector generation records the model used. [Article Embedding]({% link article-embedding.md %})
explains event versus topic representations. Changing provider, dimensions, or
embedding task requires checking compatibility and following the documented
[model rebuild procedure]({% link model-usage.md %}#switching-embedding-models); matching
vector length alone is not sufficient evidence of compatibility.

## Consistency and failure behavior

All candidate selection, related results, and updates must retain user ownership
and visibility rules. Candidate sets are bounded, and low-confidence matches may
leave articles or events unassigned. Deterministic keys and conservative matching
reduce identity churn; they do not make model results certain.

Article persistence preserves user-owned reading state across publisher revisions.
Enrichment jobs carry identifiers and version guards, reload the current target,
and verify content under the write lock. Stale work must not overwrite a later
revision, and inferred-tag replacement must not remove publisher, rule, feed, or
manual tags.

Generated-label failures leave deterministic fallback names available. Optional
job failures have retry/dead states, leases, and bounded backoff. Critical crawl
leases pause new optional claims; already-running work can finish. This priority
mechanism is not a global ban on concurrent crawls.

## Maintenance and verification

Use [Server Jobs]({% link server-jobs.md %}) and [npm Commands]({% link npm-commands.md %}) to select
supported incremental, repair, or rebuild commands. Older references to
`reclusterForUser`, `buildInterestIslands`, and `buildArticleInterestScoresForUser`
do not name current service entry points. Start from the service map above when
tracing an operation, and back up data before maintenance that rewrites state.

From `server`, run existing semantic fixtures with:

```bash
npm run test:semantic-report
```

For detailed traces, use `npm run test:semantic-trace`. Reports are written under
`server/tests/.semantic-regression/`. Tests use locally selected model fixtures;
they do not contact inference to discover the active model.

Fixture generation is a separate operation that requires the intended inference
configuration. The complete fixture set includes baseline, incremental,
incremental-unread, and taxonomy vectors. Do not regenerate fixtures merely to
make a failing regression pass. See [npm Commands]({% link npm-commands.md %}#semantic-regression-fixtures)
for generation and selection commands and `server/tests/semantic/README.md` for
report and cache conventions.

## Current decision and scoring contracts

The subsystem READMEs are the authoritative technical references:

- [Events](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/events/README.md): `eventOccurrencePolicy.js` and
  `occurrenceFeatures.js` share occurrence decisions across retrieval paths,
  including temporal span, feature conflicts and ambiguity.
- [Topics](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/topics/README.md): `topicDecisionPolicy.js` and
  `topicSubjectEvidence.js` require durable subjects, attenuate identity fallback
  and avoid ambiguous forced primaries. Labels do not establish identity.
- [Islands and interest](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/islands/README.md):
  `islandInterestConfidence.js` separates preference/support/relationship confidence;
  `behavioralIntent.js` attenuates cross-intent explicit feedback without new inference.
- [Semantic regression testing](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/tests/semantic/README.md): model-backed
  occurrence fixtures, controlled Topic gold and held-out interest tests, diagnostic
  artifacts and coverage assertions.

Island capacity leaves unmatched profiles unassigned rather than contaminating
communities. Calibration replaces current signal snapshots without replay inflation.
Scoring considers Topic, direct Island and bounded explicit behavioral paths;
strongest paths are aggregated with signed bounds. No match means neutral interest,
not an absent Recommended score. The unchanged final weights and optional input
defaults are documented in [Scoring]({% link scoring.md %}).
