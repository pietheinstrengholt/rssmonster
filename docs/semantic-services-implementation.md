---
layout: page
title: Semantic Services Implementation
parent: How RSSMonster Works
nav_order: 9
---

# Semantic Services Implementation

This guide maps the semantic workflow to the server services that implement it.
For the reader-facing concepts, start with [Events]({% link events.md %}),
and [Interest Islands]({% link interest-islands.md %}). Those pages also document their
configuration thresholds; this page focuses on service boundaries and debugging.

## Processing order

The crawl worker owns the critical sequence:

```text
entry extraction and normalization
  → publisher identity, revisions, duplicate/filter handling, persistence
  → article embeddings
  → event assignment and reconciliation
  → island scoring
```

A feed item filter can reject an entry before identity lookup; an Action can
store an entry as filtered. These are different paths. Deterministic identity
is resolved before semantic matching, and missing semantic evidence must not
turn unrelated articles into duplicates.

Optional article analysis and generated labels use the durable `processing_jobs`
queue. The AI worker can finish summaries, inferred tags, scores, and display
labels after the article or semantic target exists. It does not own the critical
embedding → event sequence. See [How RSSMonster Works]({% link how-rssmonster-works.md %})
for the full worker topology and article-analysis states.

## Service map

Paths below are relative to `server/services/`.

| Area | Entry points and supporting modules | Responsibility |
| --- | --- | --- |
| Embeddings | `articles/embedArticle.js`, `articles/embedArticles.js` | Build article representations and obtain/store vectors. |
| Event assignment | `events/assignArticleToEvent.js`, `events/ArticleEventCandidateCache.js` | Evaluate bounded article/event candidates with semantic and supporting evidence. |
| Event maintenance | `events/createEvents.js`, `events/updateEvents.js`, `events/eventReconciliation.js` | Coordinate event processing and reconcile existing groups. |
| Event presentation | `events/eventProjection.js`, `events/developingArticlePointer.js` | Maintain event projections and developing-article selection. |
| Island calibration | `islands/runIslandCalibration.js` | Coordinate behavioral profiles, persistence, audit, and article scoring. |
| Island profiles | `islands/islandArticleProfiles.js` | Build interests from behavioral article evidence. |
| Island state | `islands/islandPersistence.js`, `islands/islandAudit.js` | Preserve identity, blend vectors, and record bounded population audits. |
| Personal scoring | `score/scoreArticlesFromIslands.js` | Project island evidence into article interest scores. |
| Generated labels | `semanticLabels/semanticLabelJobs.js`, `semanticLabels/semanticLabeling.js` | Queue and produce optional semantic display labels. |
| Optional jobs | `jobs/processingJobQueue.js`, `jobs/handlers/`, `jobs/crawlPriorityLease.js` | Claim, execute, retry, and guard background work. |

`config/semanticConfig.js` centralizes semantic granularity and many matching
thresholds. Some services have additional environment-driven controls; consult
the feature-specific tuning tables before changing them.

## Stored relationships

Articles can be eventless; `eventId` is not a promise that every article belongs
to a story. An Event groups a specific occurrence. Its canonical Article members
and representative/developing pointers are preserved transactionally.

Interest Islands store user-specific signed preferences learned from Article
behavior. Candidate vectors are compared directly to active Islands. Strong
personal interest does not prove Event identity or duplicate content.

Vector generation records the model used. [Article Embedding]({% link article-embedding.md %})
explains the shared article representation. Changing provider, dimensions, or
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
- [Islands and interest](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/services/islands/README.md):
  `islandInterestConfidence.js` separates preference/support/relationship confidence;
  `behavioralIntent.js` attenuates cross-intent explicit feedback without new inference.
- [Semantic regression testing](https://github.com/pietheinstrengholt/rssmonster/blob/master/server/tests/semantic/README.md): model-backed
  occurrence fixtures, direct-affinity and held-out interest tests, diagnostic
  artifacts and coverage assertions.

Island capacity leaves unmatched profiles unassigned rather than contaminating
communities. Calibration replaces current signal snapshots without replay inflation.
Scoring considers direct Island and bounded explicit behavioral paths;
strongest paths are aggregated with signed bounds. No match means neutral interest,
not an absent Recommended score. The unchanged final weights and optional input
defaults are documented in [Scoring]({% link scoring.md %}).
