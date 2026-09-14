# RSSMonster Topic Architecture Removal

Branch: `topic-removal`. Baseline commit: `3ea410a0a07ab6137f56ae82c20f52ef1bc3cd5d`.
Validation date: 2026-09-14. This is the removal release record; historical names below are intentional.

## 1. Executive Summary

The active semantic architecture is Article → Event → Interest Island → Recommended.
Topic models, relationships, processing, generated labels, endpoints, grouping,
configuration and active documentation have been removed. A migration removes the
legacy schema and converts persisted settings while retaining Articles, Events,
Islands and behavioral evidence.

The frozen 2,000-article comparison shows no deterioration in labeled held-out
sign outcomes or measured ranking precision/recall/nDCG. All 2,000 Articles retain
finite Recommended scores. Two labeled positive laptop-review probes improve from
negative to positive after full calibration. Eleven unlabelled continuity articles
lose Topic-only interest and become neutral. That lost generalization remains a
limitation; labeled equivalence does not establish equivalence for every subject.

The semantic baseline was already failing. This report retains the seven surviving
isolated Event gold failures and the 85 longitudinal diagnostic scenario failures,
whose surviving check outcomes are identical against the preserved before/after
snapshots. Passing finite-coverage checks does not imply perfect Event clustering.

## 2. Previous Architecture

Articles were assigned to Events, then recurring subjects through `Topic`,
`EventTopic`, and `ArticleTopic`. Behavioral Topic calibration maintained another
semantic memory. `IslandTopic` enriched Islands and forwarded preference through
ArticleTopic confidence × IslandTopic confidence × IslandTopic similarity.
`Article.topicId` and `Event.topicId` denormalized primary memberships.

The dependency inventory was saved before production edits in
[the baseline inventory](../server/tests/.semantic-regression/comparisons/topic-removal/before/dependency-inventory.md).
It covered persistence, scoring, ingestion/revisions, Event reconciliation, scripts,
search, UI, generated labels, configuration, fixtures, and documentation.

## 3. New Architecture

```text
Article → deterministic identity/revision handling → embedding → Event
behavioral canonical Articles → Interest Island calibration and persistence
candidate Article vector → direct Island comparison → interestScore → Recommended
```

Events identify one real-world occurrence. Interest Islands are signed,
user-specific behavioral preferences. Eventless Articles can be personalized;
articles with neither Events nor interest still receive finite Recommended scores.
No replacement durable-subject entity or persisted candidate membership was added.

## 4. Removed Components

Removed the Topic service tree, four ORM models and their associations, both
primary-key columns, all three join tables, Topic synchronization and enrichment,
behavioral Topic calibration, Topic naming/statistics/policies/diagnostics, Topic
label generation and maintenance stages, Topic API/controller, Topic expansion,
Topic grouping and its read cascades, and the dedicated Topic CLI command.
Historical migrations remain runnable. The separate long-body Topic embedding
request was removed; the stored Article/Event embedding input remains unchanged.

## 5. Recommendation Preservation

The existing direct evaluator remains authoritative. Preference strength,
behavioral support/cohesion confidence, similarity normalization, explicit
positive/negative fallback, intent attenuation and strongest-per-sign aggregation
are preserved. Candidate similarity must remain strictly above the existing .62
default. Formation (.64), profile reuse (.78), vector blending (.35), community
capacity and evidence bounds were not loosened.

The final equation is unchanged: `.45*positiveInterest + .25*freshness +
.20*quality + .10*corroboration - .30*negativeInterest + ruleBoost`, clamped to
[0,1]. The existing rule boost is .08. No Article `interestScore` or audit snapshot
becomes new behavioral evidence.

A direct member-evidence fallback experiment did not recover the eleven lost
scores and was removed. A read-only Event-vector counterfactual also left the
Formula 1 continuity rows below the existing gate (Event similarities about
.507–.564). It yielded only small scores for three software rows through existing
explicit fallback. Those counterfactual scores are not production behavior. No
threshold reduction, label-based override, or new generalization layer was added.

## 6. Interest Island Changes

Calibration now runs behavioral profiles → persistence/audit → direct scoring.
Existing signed feedback, favorites, clicks, attention, snapshot replacement,
identity reuse and vector blending remain. More-like-this/not-interested carry
+8/−8 formation evidence; favorites +4, clicks +2 up to three, deep reads +1.

Archival uses current bounded behavioral support confidence instead of removed
membership confidence, retaining the .12 confidence / 45-day stale gates. Existing
Islands and audits survive the migration. Naming uses taxonomy or source articles;
disambiguation uses source-article support, weight and stable IDs.

Settings coverage and `island:true/false` now compare candidate vectors directly
with active owned Islands. Structural affinity is independent of signed weight,
nonzero interest and Event membership. This is an intentional filter-contract
change. Sources explain why an Island exists; related articles explain direct
semantic affinity. Article metadata is fetched in batches, not once per Island.

## 7. Event Pipeline Changes

Occurrence policy, candidate retrieval, temporal windows, version/location/action
checks, vectors, membership transactions, lifecycle, source counts and
representative/developing pointers remain intact. Incremental, repair and
historical scopes no longer assign or synchronize Topics. Cache changes still
follow committed Event writes.

Event strength retains redundancy .45, cohesion .35 and the previous minimum
baseline `.20/3`. The former subject-history bonus is removed; larger recurring
subjects no longer raise occurrence strength. This is an explicit consequence of
removing that evidence, not a change to final Recommended weights. All 2,000 final
Event memberships match the baseline exactly; Event totals remain 128 then 315.

## 8. Database Migration

`20260914000000-remove-topics.mjs` follows the migration runner's ESM convention.
It drops the dependent join tables, removes `topicId` foreign keys/indexes/columns,
then drops `topics`. MySQL uses QueryInterface schema operations. SQLite rebuilds
only affected tables, preserving retained definitions, indexes, triggers, values,
foreign keys and allocated autoincrement high-water marks.

SQLite's connection-local foreign-key setting is disabled before BEGIN on the
same bound connection used for the rebuild. A file-backed upgrade test detected
and verified the fix for a connection-switch cascade that could otherwise clear
Event links. The transaction checks all foreign keys before commit and restores
the connection setting before release.

The migration deletes only generated-label jobs targeting Topics, changes saved
`grouping:topic` settings/operators to Event grouping, and removes only `topicIds`
from Island audit entries. Quoted search text stays unchanged. Other jobs and all
behavioral snapshots remain. `down` explicitly requires restoration from backup;
it cannot reconstruct deleted semantic data.

## 9. Model / Association Cleanup

Removed `Topic`, `ArticleTopic`, `EventTopic`, `IslandTopic`, primary-topic fields,
the virtual Article topic key, and related associations/exports. Model factories
remain unchanged in pattern. Both dialects initialize against the migrated schema.
Desktop runtime checks now verify the remaining Event and Island model state.

## 10. API / UI Changes

Removed `/api/topics/articles`, Topic expansion and grouping, Topic badges/fields,
and Topic insights. The surviving operational panels are **Settings → Events**,
served by `/api/setting/events`. Event size/status/count/reuse panels remain.

Island overview and recommendation/briefing attribution use remaining direct
Article evidence. Daily Briefing context counts matched Interest Islands instead
of Topics. Search applies owned/canonical/visibility predicates before bounded
vector batches, then applies matching IDs before counts, ranking and pagination.
No compatibility endpoint or dormant Topic handler remains. Existing saved
settings are converted once by the migration.

## 11. Configuration Cleanup

Removed Topic assignment/identity/creation/drift/behavior constants and
Island-Topic enrichment, membership blending/decay, temporal-affinity and
Topic-community controls. Removed the `topics` npm command and skip-Topic flags
from Event backfill. Updated environment examples and operations documentation.
The surviving Island and final ranking thresholds/weights retain their values.

## 12. Test Changes

Deleted tests limited to Topic models, assignments, naming, subject identity,
relationship synchronization and enrichment. Shared tests retain Event rollback,
cache, identity, reconciliation, ownership, scoring, explicit feedback,
calibration replay, candidate filtering, presentation and job contracts.

Added fresh/upgrade migration checks on both dialects and direct affinity tests
for neutral/negative Islands, invalid vectors, ownership/visibility, bounded
paging and empty Islands. Replaced intermediary-based recommendation fixtures
with direct vectors while preserving signed scoring and duplicate exclusion.
Retained the 226-article isolated corpus: former subject-only scenarios now check
finite Article/Recommended coverage without asserting retired identities. The
2,000 main articles, text, chronology and behavioral fields are byte-equivalent
under canonical JSON projection; vectors and model are unchanged. Metadata-only
expectations were retired. Generic taxonomy `Topic:` embedding text and its tests
remain unchanged because it names a taxonomy concept, not a persisted Topic.

## 13. Before / After Recommendation Results

Source data: [structured comparison](topic-removal-results.json),
[before snapshot](../server/tests/.semantic-regression/comparisons/topic-removal/before/batch-results.json),
[after snapshot](../server/tests/.semantic-regression/comparisons/topic-removal/after/batch-results.json).
Raw snapshots/logs are saved locally in the ignored semantic artifact directory;
the structured comparison and this release report are tracked deliverables.

Model: `onnx-community/Qwen3-Embedding-0.6B-ONNX`, 1,024 dimensions. No model/vector
regeneration was performed. Full fixture hashes differ because retired regression
metadata changed; the following content/behavior hashes exclude only `regression`.

| Batch | Before = after SHA-256 |
| --- | --- |
| 1 | 4559207cb68cd2ff59894b51ad732510b5d76f23c6e0d82fe16f7e16df744b33 |
| 2 | ee62223d0a90c16eb08d1d90d77bacba441b7a58786964c410a2e06dec3d26df |

### Score coverage

| Metric | Batch001 before | Batch001 after | Final before | Final after |
| --- | --- | --- | --- | --- |
| Articles eligible for Recommended | 1000 | 1000 | 2000 | 2000 |
| Articles with Recommended score | 1000 | 1000 | 2000 | 2000 |
| Recommended coverage (%) | 100 | 100 | 100 | 100 |
| Articles with non-zero interest | 54 | 50 | 226 | 215 |
| Positive-interest articles | 48 | 44 | 178 | 169 |
| Articles with negative interest | 6 | 6 | 48 | 46 |
| Articles with neutral interest | 946 | 950 | 1774 | 1785 |
| Events | 128 | 128 | 315 | 315 |
| Eventless | 520 | 520 | 864 | 864 |
| Islands | 10 | 10 | 13 | 13 |
| Singleton Islands | 6 | 6 | 7 | 7 |
| Unassigned behavioral profiles | 129 | 129 | 144 | 144 |

### Held-out scores, before feedback

| Expected class | Count | Before + / 0 / − | After + / 0 / − |
| --- | --- | --- | --- |
| unlabelled | 16 | 16 / 0 / 0 | 16 / 0 / 0 |
| attenuated | 25 | 15 / 5 / 5 | 15 / 5 / 5 |
| positive | 60 | 60 / 0 / 0 | 60 / 0 / 0 |
| neutral | 24 | 0 / 24 / 0 | 0 / 24 / 0 |
| negative | 23 | 0 / 0 / 23 | 0 / 0 / 23 |
| emerging | 12 | 0 / 12 / 0 | 0 / 12 / 0 |

All 160 probes retain their sign distribution. Eight magnitudes change: four
positive photo-backup probes fall from .2037 to .0868–.0932; four unlabelled F1
probes fall from .4471 to .3624–.4188. All remain positive. Twelve emerging probes
are neutral both before and after; this does not demonstrate successful emerging
interest recovery. After final calibration, 40 of 2,000 interest scores differ.

| Probe | Expected | Before final score | After final score |
| --- | --- | --- | --- |
| capacity-and-intent-19 | positive | -0.1802 | 0.0646 |
| capacity-and-intent-21 | positive | -0.1244 | 0.0656 |

### Interest and Recommended quantiles

Batch 1 (1000 Articles), linearly interpolated empirical quantiles:

| Quantile | Interest before | Interest after | Recommended before | Recommended after |
| --- | --- | --- | --- | --- |
| 0 | -0.350000 | -0.350000 | 0.029015 | 0.029015 |
| 0.1 | 0.000000 | 0.000000 | 0.112698 | 0.112698 |
| 0.25 | 0.000000 | 0.000000 | 0.121937 | 0.121937 |
| 0.5 | 0.000000 | 0.000000 | 0.190967 | 0.190967 |
| 0.75 | 0.000000 | 0.000000 | 0.317743 | 0.317743 |
| 0.9 | 0.000000 | 0.000000 | 0.334556 | 0.334198 |
| 0.95 | 0.000000 | 0.000000 | 0.338728 | 0.336896 |
| 0.99 | 0.350468 | 0.349406 | 0.409468 | 0.364691 |
| 1 | 0.543700 | 0.543700 | 0.509125 | 0.399641 |

Batch 2 (2000 Articles), linearly interpolated empirical quantiles:

| Quantile | Interest before | Interest after | Recommended before | Recommended after |
| --- | --- | --- | --- | --- |
| 0 | -0.395200 | -0.395200 | 0.017596 | 0.017596 |
| 0.1 | 0.000000 | 0.000000 | 0.111930 | 0.111930 |
| 0.25 | 0.000000 | 0.000000 | 0.173810 | 0.173810 |
| 0.5 | 0.000000 | 0.000000 | 0.276110 | 0.275496 |
| 0.75 | 0.000000 | 0.000000 | 0.334947 | 0.333525 |
| 0.9 | 0.000000 | 0.000000 | 0.352381 | 0.350733 |
| 0.95 | 0.117680 | 0.093200 | 0.369283 | 0.367521 |
| 0.99 | 0.353400 | 0.350000 | 0.426502 | 0.420840 |
| 1 | 0.595100 | 0.595100 | 0.597951 | 0.597951 |

### Ranking on judged held-out candidates

Only 107 probes have unambiguous positive/negative/neutral labels (60 relevant
positives). Emerging, attenuated and unlabelled probes are excluded. Binary
relevance is 1 only for expected positive; ties use source ID. Newest uses the
same frozen fixture publication times. These are pooled offline fixture metrics,
not whole-library production ranking or a representative user study.

| Ranking | K | Precision before → after | Recall before → after | nDCG before → after |
| --- | --- | --- | --- | --- |
| recommended | 10 | 1.0000 → 1.0000 | 0.1667 → 0.1667 | 1.0000 → 1.0000 |
| recommended | 20 | 1.0000 → 1.0000 | 0.3333 → 0.3333 | 1.0000 → 1.0000 |
| recommended | 50 | 1.0000 → 1.0000 | 0.8333 → 0.8333 | 1.0000 → 1.0000 |
| newest | 10 | 0.0000 → 0.0000 | 0.0000 → 0.0000 | 0.0000 → 0.0000 |
| newest | 20 | 0.0000 → 0.0000 | 0.0000 → 0.0000 | 0.0000 → 0.0000 |
| newest | 50 | 0.4800 → 0.4800 | 0.4000 → 0.4000 | 0.3627 → 0.3627 |

### Articles losing exclusively Topic-mediated interest

| Source ID | Title | Before path | Before | After direct path / score | Expected label |
| --- | --- | --- | --- | --- | --- |
| long-continuity-43-baseline-169 | Formula 1 championship Singapore Grand Prix: first details confirmed | ArticleTopic → IslandTopic → Island | 0.3534 | No qualifying path / 0 | Not provided |
| long-continuity-43-baseline-170 | Independent report confirms Formula 1 championship Singapore Grand Prix | ArticleTopic → IslandTopic → Island | 0.3534 | No qualifying path / 0 | Not provided |
| long-continuity-43-baseline-171 | Formula 1 championship publishes details of Singapore Grand Prix | ArticleTopic → IslandTopic → Island | 0.3534 | No qualifying path / 0 | Not provided |
| long-continuity-43-baseline-172 | What Formula 1 championship Singapore Grand Prix means for participants | ArticleTopic → IslandTopic → Island | 0.3534 | No qualifying path / 0 | Not provided |
| long-continuity-09-incremental-033 | Immich 2.1: availability and timetable clarified | ArticleTopic → IslandTopic → Island | 0.1713 | No qualifying path / 0 | Not provided |
| long-continuity-10-incremental-037 | Nextcloud 33: availability and timetable clarified | ArticleTopic → IslandTopic → Island | 0.1368 | No qualifying path / 0 | Not provided |
| long-continuity-10-incremental-038 | Further details on Nextcloud 33 | ArticleTopic → IslandTopic → Island | 0.1368 | No qualifying path / 0 | Not provided |
| long-continuity-43-incremental-169 | Formula 1 championship Singapore Grand Prix: availability and timetable clarified | ArticleTopic → IslandTopic → Island | 0.3321 | No qualifying path / 0 | Not provided |
| long-continuity-43-incremental-170 | Further details on Formula 1 championship Singapore Grand Prix | ArticleTopic → IslandTopic → Island | 0.3321 | No qualifying path / 0 | Not provided |
| long-continuity-43-incremental-171 | Formula 1 championship confirms Las Vegas Grand Prix | ArticleTopic → IslandTopic → Island | 0.3056 | No qualifying path / 0 | Not provided |
| long-continuity-43-incremental-172 | Las Vegas Grand Prix marks next chapter for Formula 1 championship | ArticleTopic → IslandTopic → Island | 0.3056 | No qualifying path / 0 | Not provided |

Every row above retains its Article and Event; only the derived personal boost
is lost. The structured comparison includes the original confidence factors and
selected path IDs. [Direct/Event counterfactual evidence](../server/tests/.semantic-regression/comparisons/topic-removal/after/lost-path-evidence.json)
records why simply substituting an Event vector would not restore equivalent
behavior. These unlabelled losses must not be described as proven improvements.

## 14. Performance Comparison

| Measured interval | Before seconds | After seconds | Change |
| --- | --- | --- | --- |
| Batch 1 | 57.68 | 36.72 | -36.3% |
| Batch 2 | 85.14 | 63.65 | -25.2% |

Measured semantic phases total 142.82s → 100.37s (29.7% faster). Whole trace test
runtime is 170.20s → 126.33s. One paired run is directional evidence, not a
controlled benchmark with confidence intervals. The trace starts after ingestion;
it does not measure publisher fetching, live inference, or end-to-end crawl time.

No separate before/after wall-clock measurement of calibration versus scoring is
available: the harness freezes Date, so the existing calibration log's `0.0 sec`
is not a usable timing measurement. Removed work includes Topic queries/updates,
join synchronization, enrichment and Topic embedding/label requests. Direct
scoring no longer queries ArticleTopic or IslandTopic per candidate batch.

Search/overview affinity now performs JavaScript vector comparisons over all
eligible articles in batches of 200 and retains matching IDs. This bounds vector
loading but costs O(eligible articles × active Islands); it can be slower than the
former indexed relationship filter on large libraries. No production query-count
or large-library search benchmark was captured. That scalability risk is explicit.

## 15. Upgrade Validation

The migration tests run the complete historical migration chain for both fresh
installation and an upgrade populated with all four legacy tables. They verify
preserved Article/Event fields and pointers, behavior, Island vectors/weight/audit,
Feeds, non-Topic indexes, autoincrement high-water marks, saved settings/searches,
other generated-label jobs, foreign-key enforcement, model initialization and
positive direct scoring with finite Recommended after upgrade.

MySQL uses only the isolated `rssmonstertest` database. SQLite uses a disposable
file-backed database, exercising connection switching rather than only an
in-memory database. No production migration, reset, backfill, push or deployment
was performed. Tests restore the shared MySQL model schema after migration checks.

## 16. Documentation Changes

Updated root, service and UI READMEs; Event/Island/scoring/search/API/configuration,
embedding, inference, model-maintenance, operations, comparison and semantic-test
guides; diagrams; and repository agent guidance. Deleted the standalone Topic
guide. Archived model-comparison and taxonomy-evaluation documents explicitly state
that they describe the former architecture.

Remaining matches are classified as: historical migrations/migration tests;
this removal report/results and release history; explicitly historical evaluation
pages; generic subjects in publisher content, tags, taxonomy seed descriptions,
classification/Smart Folder prompts and taxonomy embedding inputs; the generic
README guide-table heading; and the pre-existing user-owned untracked
`docs/semantic-architecture-validation.md`, which was preserved. No active ORM,
Topic identifier, Topic environment control or Topic job/endpoint remains.

## 17. Remaining Risks

- Eleven unlabelled continuity articles lose boosts; eight held-out magnitudes
  decrease. The labeled sign/ranking metrics establish equivalence only within
  the judged fixture slice, not universal personalization equivalence.
- Existing isolated Event gold failures and 85 longitudinal diagnostic failures
  remain. The exact 113 surviving longitudinal check failures match the baseline
  snapshot under the same retained predicates; these were not repaired by
  retuning occurrence rules in this removal.
- Emerging probes remain neutral in this fixture. Current publication-based
  explicit-feedback recency is still a proxy for interaction timestamps.
- Direct Island filtering scans the eligible library in bounded batches. Very
  large installations need measured search/overview latency before claiming
  performance improvement for those endpoints.
- Removing the subject-history Event-strength bonus can change operational
  strength displays/ordering. Generated names now depend on remaining source
  articles; no former Topic names are retained as hidden personalization state.
- The migration is intentionally destructive only to derived Topic data and
  cannot reconstruct that data on rollback. MySQL DDL is not transactional;
  reruns inspect existing tables/columns to continue after partial completion.

## 18. Complete File Change List

The list below excludes the user-owned untracked validation document and generated
ignored artifacts. `D` means removed, `M` modified, and `A` newly created.

| Change | File |
| --- | --- |
| M | `AGENTS.md` |
| M | `README.md` |
| M | `client/AGENTS.md` |
| M | `client/pwa-policy.js` |
| M | `client/src/api/settings.js` |
| D | `client/src/api/topics.js` |
| M | `client/src/assets/design/rssmonster.md` |
| M | `client/src/components/articles/Article.vue` |
| M | `client/src/components/articles/README.md` |
| M | `client/src/components/articles/feed/visibilityTracking.js` |
| M | `client/src/components/articles/helpers/articleExpansion.js` |
| M | `client/src/components/briefing/DailyBriefingIntro.vue` |
| M | `client/src/components/briefing/README.md` |
| M | `client/src/components/settings/README.md` |
| M | `client/src/components/settings/Settings.vue` |
| A | `client/src/components/settings/SettingsEvents.vue` |
| M | `client/src/components/settings/SettingsIslands.vue` |
| M | `client/src/components/settings/SettingsObservability.vue` |
| M | `client/src/components/settings/SettingsProcessingJobs.vue` |
| D | `client/src/components/settings/SettingsTopics.vue` |
| M | `client/src/components/settings/SettingsWelcome.vue` |
| M | `client/src/components/settings/smartFolders/SmartFolderEditor.vue` |
| M | `client/src/components/settings/smartFolders/smartFolderQuery.js` |
| M | `client/src/components/shell/README.md` |
| M | `client/src/components/sidebar/README.md` |
| M | `client/src/config/articleSelectionOptions.js` |
| M | `client/src/services/queryValidation.js` |
| M | `client/src/services/smartFolderPresentation.js` |
| M | `client/src/store/README.md` |
| M | `client/src/store/selection.js` |
| M | `client/tests/article-components-coverage.test.js` |
| M | `client/tests/article-domain-boundaries.test.js` |
| M | `client/tests/article-selection-options.test.js` |
| M | `client/tests/articles-api.test.js` |
| M | `client/tests/content-api-contracts.test.js` |
| M | `client/tests/daily-briefing-intro.test.js` |
| M | `client/tests/data-store-actions-and-getters.test.js` |
| M | `client/tests/data-store-overview-counts.test.js` |
| M | `client/tests/high-impact-coverage.test.js` |
| M | `client/tests/management-api-contracts.test.js` |
| M | `client/tests/navigation-shell-coverage.test.js` |
| M | `client/tests/settings-insights.test.js` |
| M | `client/tests/settings-navigation.test.js` |
| M | `client/tests/settings-smart-folders-editor.test.js` |
| M | `client/tests/shell-components-coverage.test.js` |
| M | `client/tests/smart-folder-presentation.test.js` |
| M | `client/tests/store-resource-state.test.js` |
| M | `client/tests/store-response-ordering.test.js` |
| M | `client/tests/toolbar-briefing-status.test.js` |
| M | `desktop/tests/helpers/runtime-check.js` |
| M | `docs/article-embedding.md` |
| M | `docs/bookmarks.md` |
| M | `docs/compare/commafeed.md` |
| M | `docs/compare/feedbin.md` |
| M | `docs/compare/freshrss.md` |
| M | `docs/compare/miniflux.md` |
| M | `docs/compare/selfoss.md` |
| M | `docs/compare/tiny-tiny-rss.md` |
| M | `docs/comparison.md` |
| M | `docs/concepts.md` |
| M | `docs/configuration.md` |
| M | `docs/crawling.md` |
| M | `docs/daily-briefing.md` |
| M | `docs/events.md` |
| M | `docs/faq.md` |
| M | `docs/feedtrust.md` |
| M | `docs/getting-started.md` |
| M | `docs/how-rssmonster-works.md` |
| M | `docs/index.md` |
| M | `docs/inference.md` |
| M | `docs/interest-islands.md` |
| M | `docs/model-openai.md` |
| M | `docs/model-qwen.md` |
| M | `docs/model-usage.md` |
| M | `docs/npm-commands.md` |
| M | `docs/rssmonster-api.md` |
| M | `docs/scoring.md` |
| M | `docs/search.md` |
| M | `docs/semantic-services-implementation.md` |
| M | `docs/server-jobs.md` |
| M | `docs/smart-folders.md` |
| M | `docs/taxonomy-embedding-strategy-evaluation.md` |
| A | `docs/topic-removal-report.md` |
| A | `docs/topic-removal-results.json` |
| D | `docs/topics.md` |
| M | `docs/using-rssmonster.md` |
| M | `inference/README.md` |
| M | `inference/src/semanticLabels/semanticLabelService.js` |
| M | `inference/tests/semanticLabelService.test.js` |
| M | `inference/tests/semanticLabelsRoute.test.js` |
| M | `server/.env.example` |
| M | `server/AGENTS.md` |
| M | `server/app.js` |
| M | `server/config/intelligentFeatures.js` |
| M | `server/controllers/article.js` |
| M | `server/controllers/manager.js` |
| M | `server/controllers/setting.js` |
| M | `server/controllers/tag.js` |
| D | `server/controllers/topics.js` |
| M | `server/controllers/user.js` |
| A | `server/migrations/20260914000000-remove-topics.mjs` |
| M | `server/models/article.js` |
| D | `server/models/articleTopic.js` |
| M | `server/models/event.js` |
| D | `server/models/eventTopic.js` |
| M | `server/models/index.js` |
| D | `server/models/islandTopic.js` |
| M | `server/models/setting.js` |
| D | `server/models/topic.js` |
| M | `server/package.json` |
| M | `server/routes/setting.js` |
| D | `server/routes/topics.js` |
| M | `server/scripts/backfillHistoricalEventArticles.js` |
| M | `server/scripts/lib/realIncrementalFixture.js` |
| M | `server/scripts/rebuildSemanticForEmbeddingModel.js` |
| M | `server/scripts/rebuildSemanticPipeline.js` |
| M | `server/scripts/repairSemanticPipeline.js` |
| M | `server/scripts/resetSemanticState.js` |
| M | `server/scripts/runEventsCommand.js` |
| M | `server/scripts/runSemanticPipeline.js` |
| D | `server/scripts/runTopicsCommand.js` |
| M | `server/services/AGENTS.md` |
| M | `server/services/README.md` |
| M | `server/services/ai/README.md` |
| M | `server/services/ai/capabilities/generation.js` |
| M | `server/services/articleSearch/AGENTS.md` |
| M | `server/services/articleSearch/README.md` |
| M | `server/services/articleSearch/articleQueryParser.service.js` |
| M | `server/services/articleSearch/articleSearch.service.js` |
| M | `server/services/articleSearch/articleSearchExecutor.service.js` |
| M | `server/services/articles/embedArticle.js` |
| M | `server/services/config/semanticConfig.js` |
| M | `server/services/crawl/README.md` |
| M | `server/services/crawl/enrichment/README.md` |
| M | `server/services/crawl/orchestration/README.md` |
| M | `server/services/crawl/orchestration/postCrawlSemanticPipeline.js` |
| M | `server/services/crawl/orchestration/processArticleRevision.js` |
| M | `server/services/dailyBriefing/dailyBriefing.service.js` |
| M | `server/services/duplicates/articleDuplicates.js` |
| M | `server/services/events/README.md` |
| M | `server/services/events/assignArticleToEvent.js` |
| M | `server/services/events/createEvents.js` |
| D | `server/services/events/eventArticleTopicSync.js` |
| M | `server/services/events/eventPipelineDebug.js` |
| M | `server/services/events/eventReconciliation.js` |
| M | `server/services/events/updateEvents.js` |
| M | `server/services/feeds/feedReconciliation.js` |
| M | `server/services/islands/README.md` |
| A | `server/services/islands/islandArticleMatches.js` |
| M | `server/services/islands/islandArticleProfiles.js` |
| M | `server/services/islands/islandAudit.js` |
| M | `server/services/islands/islandInterestConfidence.js` |
| D | `server/services/islands/islandMemberships.js` |
| M | `server/services/islands/islandNameDisambiguation.js` |
| M | `server/services/islands/islandPersistence.js` |
| D | `server/services/islands/islandTopicProfiles.js` |
| M | `server/services/islands/islandVectorUtils.js` |
| M | `server/services/islands/runIslandCalibration.js` |
| M | `server/services/jobs/handlers/semanticLabelJobHandler.js` |
| M | `server/services/observability/semanticLogging.js` |
| M | `server/services/reconcile/semanticPipelineScopes.js` |
| M | `server/services/score/scoreArticlesFromIslands.js` |
| M | `server/services/semanticLabels/semanticLabelJobs.js` |
| M | `server/services/semanticLabels/semanticLabeling.js` |
| D | `server/services/topics/README.md` |
| D | `server/services/topics/behavioral/calibrateBehavioralTopics.js` |
| D | `server/services/topics/event/assignEventToTopic.js` |
| D | `server/services/topics/event/createTopics.js` |
| D | `server/services/topics/event/eventTopicAssignment.js` |
| D | `server/services/topics/event/topicDecisionDiagnostics.js` |
| D | `server/services/topics/event/topicDecisionPolicy.js` |
| D | `server/services/topics/event/updateTopic.js` |
| D | `server/services/topics/shared/topicHelpers.js` |
| D | `server/services/topics/shared/topicName.service.js` |
| D | `server/services/topics/shared/topicStats.service.js` |
| D | `server/services/topics/shared/topicSubjectEvidence.js` |
| M | `server/tests/ai/capabilities.test.js` |
| M | `server/tests/articleSearch/articleQueryParser.service.test.js` |
| M | `server/tests/articleSearch/articleSearch.service.test.js` |
| M | `server/tests/articleSearch/articleSearchExecutor.service.test.js` |
| M | `server/tests/articles/embedArticle.service.test.js` |
| M | `server/tests/controllers/article.authorization.test.js` |
| M | `server/tests/controllers/article.briefing.controller.test.js` |
| M | `server/tests/controllers/article.cursor-pagination.test.js` |
| M | `server/tests/controllers/controllerFailurePaths.test.js` |
| M | `server/tests/controllers/coreCollections.controller.test.js` |
| M | `server/tests/controllers/settings.controller.branches.test.js` |
| M | `server/tests/controllers/settings.controller.test.js` |
| M | `server/tests/controllers/settings.islands-command.controller.test.js` |
| M | `server/tests/controllers/settings.islands.controller.test.js` |
| M | `server/tests/controllers/user.controller.test.js` |
| M | `server/tests/crawl/postCrawlSemanticPipeline.service.test.js` |
| M | `server/tests/crawl/processArticle.aiAnalysis.test.js` |
| M | `server/tests/crawl/updateArticle.test.js` |
| M | `server/tests/duplicates/articleDuplicates.service.test.js` |
| M | `server/tests/events/assignArticleToEvent.debug.test.js` |
| M | `server/tests/events/assignArticleToEvent.edge.test.js` |
| M | `server/tests/events/createEvents.service.test.js` |
| D | `server/tests/events/eventArticleTopicSync.test.js` |
| M | `server/tests/events/eventOccurrenceAssignment.test.js` |
| M | `server/tests/events/eventPipelineDebug.test.js` |
| M | `server/tests/events/eventReconciliation.service.test.js` |
| M | `server/tests/events/repairRecentEventsForUser.service.test.js` |
| M | `server/tests/events/semanticPipelineScopes.service.test.js` |
| M | `server/tests/feeds/feedReconciliation.integration.test.js` |
| M | `server/tests/fixtures/semantic-regression-batch001.json` |
| M | `server/tests/fixtures/semantic-regression-batch002.json` |
| M | `server/tests/fixtures/semantic-regression-occurrences.md` |
| D | `server/tests/fixtures/semantic-topic-gold.json` |
| M | `server/tests/helpers/semanticExpansion.js` |
| M | `server/tests/helpers/semanticExpansion.test.js` |
| M | `server/tests/helpers/semanticLongitudinal.js` |
| M | `server/tests/helpers/semanticRecommendationDiagnostics.js` |
| M | `server/tests/helpers/semanticRegressionHelpers.test.js` |
| D | `server/tests/helpers/semanticRegressionIslands.js` |
| M | `server/tests/helpers/semanticRegressionMarkdownReport.js` |
| M | `server/tests/helpers/semanticRegressionMarkdownReport.test.js` |
| M | `server/tests/helpers/semanticRegressionReport.js` |
| D | `server/tests/helpers/semanticRegressionTrace.js` |
| A | `server/tests/islands/islandArticleMatches.test.js` |
| M | `server/tests/islands/islandAudit.test.js` |
| D | `server/tests/islands/islandMemberships.test.js` |
| M | `server/tests/islands/islandNameDisambiguation.service.test.js` |
| M | `server/tests/islands/islandNameDisambiguation.test.js` |
| M | `server/tests/islands/islandPersistence.test.js` |
| D | `server/tests/islands/islandTopicProfiles.debug.test.js` |
| D | `server/tests/islands/islandTopicProfiles.service.test.js` |
| M | `server/tests/islands/islandVectorUtils.test.js` |
| M | `server/tests/islands/runIslandCalibration.test.js` |
| M | `server/tests/islands/scoreArticlesFromIslands.test.js` |
| A | `server/tests/migrations/topicRemoval.migration.test.js` |
| M | `server/tests/models/databaseTypes.model.test.js` |
| M | `server/tests/models/semanticGeneratedLabels.model.test.js` |
| M | `server/tests/scripts/realIncrementalFixture.test.js` |
| M | `server/tests/scripts/rebuildSemanticForEmbeddingModel.test.js` |
| M | `server/tests/semantic/README.md` |
| M | `server/tests/semantic/semanticRegression.batches.test.js` |
| M | `server/tests/semanticGold/semanticRegression.expansion.test.js` |
| M | `server/tests/semanticGold/semanticRegression.incremental.adEvent.test.js` |
| M | `server/tests/semanticGold/semanticRegression.incremental.occurrences.test.js` |
| M | `server/tests/semanticGold/semanticRegression.interestConfidence.test.js` |
| M | `server/tests/semanticGold/semanticRegression.islandQuality.test.js` |
| M | `server/tests/semanticGold/semanticRegression.longitudinal.test.js` |
| D | `server/tests/semanticGold/semanticRegression.topicGold.test.js` |
| M | `server/tests/semanticLabels/semanticLabelJobHandler.service.test.js` |
| M | `server/tests/semanticLabels/semanticLabelJobs.service.test.js` |
| M | `server/tests/semanticLabels/semanticLabeling.service.test.js` |
| M | `server/tests/services/dailyBriefing.service.test.js` |
| M | `server/tests/services/semanticLogging.service.test.js` |
| D | `server/tests/topics/assignEventToTopic.test.js` |
| D | `server/tests/topics/calibrateBehavioralTopics.test.js` |
| D | `server/tests/topics/createTopics.service.test.js` |
| D | `server/tests/topics/eventTopicAssignment.service.test.js` |
| D | `server/tests/topics/topicCreationGate.test.js` |
| D | `server/tests/topics/topicHelpers.service.test.js` |
| D | `server/tests/topics/topicName.service.test.js` |
| D | `server/tests/topics/updateTopic.service.test.js` |

## 19. Commands Executed

Node/npm used `/home/piethein/.nvm/versions/node/v22.23.2/bin` on PATH. The initial
baseline invocation found no npm on the default PATH; the corrected invocation
succeeded. No dependencies were installed or upgraded.

- Repository-wide `rg` / `rg --files`, relevant AGENTS/README/model/migration/caller reads.
- `git switch -c topic-removal`; `git status`, `git diff`, `git diff --check`.
- Before and after: `npm run test:semantic-trace --prefix server`.
- Before and after: `npm run test:semantic-gold --prefix server`.
- `npm test --prefix server`, plus focused Event, Island, search, controller, job,
  fixture, and migration runs while fixing removal regressions.
- `npm test --prefix server -- tests/migrations/topicRemoval.migration.test.js`.
- `DB_DIALECT=sqlite DB_STORAGE=/tmp/rssmonster-topic-removal-migration.sqlite
  npm test --prefix server -- tests/migrations/topicRemoval.migration.test.js`.
- `npm test --prefix client`; `npm run lint --prefix client`; `npm run build --prefix client`.
- `npm test --prefix inference`; `npm run lint --prefix inference`.
- `npm test --prefix desktop`; `npm run lint --prefix desktop`.
- `npm run lint --prefix server`; targeted `node --check`.
- Read-only snapshot comparison: empirical quantiles, judged ranking metrics,
  changed/Topic-only paths, canonical corpus hashes and identical Event memberships.
- Retrospective application of the surviving longitudinal predicates to both saved
  snapshots: 138 scenarios, 85 failing scenarios and 113 failing checks on each,
  with identical check records. This is baseline-snapshot re-evaluation, not a
  claim that the entire original server suite ran before editing.

Raw logs and comparisons are under
`server/tests/.semantic-regression/comparisons/topic-removal/`.

## 20. Final Test Results

| Check | Result |
| --- | --- |
| Final full server run | 311 files passed, 3 failed; 3,313 tests passed, 93 failed, 2 todo (483.84 s) |
| Follow-up after boundary-fixture correction | Island filter: 3/3 passed; longitudinal: 53 passed, 85 failed, exactly 113 failing checks (22.71 s combined) |
| Semantic trace | Passed: 2,000 finite scores, unchanged Event memberships; 126.33 s total |
| Isolated semantic gold | 66 passed, 7 failed (46.60 s) |
| MySQL fresh install + upgrade | Both passed, including in the full server run |
| SQLite file-backed fresh install + upgrade | Both passed (3.13 s) |
| Client | 136 files, 1,462 tests passed (28.70 s) |
| Inference | 31 files, 316 tests passed (3.03 s) |
| Desktop | 1 test passed (12.15 s) |
| Server/client/inference/desktop lint | Passed |
| Client production build | Passed |
| Final diff whitespace check | Passed |

The full server run's one introduced failure was a new test's floating-point
boundary fixture: cosine normalization made an intended .5 slightly greater than
.5. The corrected fixture tests exact equality at 1, preserving the strict `>`
contract; all three filter tests then passed. Production thresholds were unchanged.
The entire server suite was not rerun after this test-only correction.

The remaining 92 failing tests are the seven Event gold cases and 85 longitudinal
scenarios described above. The saved original gold run and retrospective identical
longitudinal check records establish the surviving failures against the baseline.
They are not hidden, skipped, or counted as passing. Obsolete Topic-only tests were
removed separately; no surviving Event or recommendation expectations were relaxed.

All four original vector-cache file hashes were verified again. The two article
cache files had been pretty-printed without changing any parsed data; restoring
the original serialization reproduced their exact baseline SHA-256 hashes.

No production migration, deployment, commit or push was performed. Changes remain
on `topic-removal` for review. The pre-existing untracked
`docs/semantic-architecture-validation.md` was preserved untouched.


### Final review and closure (2026-09-14)

Reviewed the working-tree removal against baseline commit
`3ea410a0a07ab6137f56ae82c20f52ef1bc3cd5d`, following the code-review and
close-the-loop skills. The acceptance scope was complete active Topic removal,
retained Event/Island and signed-feedback behavior, owned API/UI contracts,
fresh/upgrade data integrity in both dialects, unchanged final scoring weights,
and the captured recommendation comparison. No new requirements were added.

No actionable blocking or non-blocking runtime defect was found. No production
code or test changes were needed in this closing review. Reviewed migration
ordering, SQLite connection/transaction handling, retained indexes and IDs,
metadata conversion, scorer callers, direct affinity filtering, Event
reconciliation, and the settings/briefing client-server contracts.

Fresh validation for this review:

- MySQL migration, Island, Event-repair, article-search and Daily Briefing checks:
  **16 files, 153 tests passed**, 92.17 seconds.
- File-backed SQLite fresh-install and upgrade checks: **2 tests passed**, 4.07 seconds.
- Server lint and final diff whitespace checks: passed.
- Earlier full client/inference/desktop tests and client build remain applicable;
  no implementation changed during this review. The earlier 92 surviving semantic
  baseline failures remain explicitly reported above.

The measured frozen labeled recommendation contract passes. Generalization for
the eleven unlabelled Topic-only losses is **not proven**; this review does not
reclassify those losses as improvements or claim universal production equivalence.
They account for 11 of 2,000 final candidates; no labeled sign/ranking regression
or new Event membership change was observed. Large-library affinity-scan cost is
an existing documented limitation of this removal, without a demonstrated failure
in this validation. No threshold retuning or alternate semantic layer was added.

A final read-only acceptance review follows this record; no additional broad
review cycle is proposed. Decision: **GOOD TO GO — FEATURE CLOSED** against the
measured acceptance contract, with the disclosed evidence limits and pre-existing
semantic failures retained. No commit, push, deployment or production migration.
