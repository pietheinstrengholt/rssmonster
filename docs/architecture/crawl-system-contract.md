# CRAWL SYSTEM INVARIANTS

Feeds define what RSSMonster attempts to retrieve. Crawl runs execute that work. Crawl results record what happened. Accepted Feed items may create or update Articles.

These invariants describe behavior that must survive a complete crawler refactor. They do not prescribe retrieval mechanisms, processing architecture, storage strategies, or an execution sequence beyond the dependencies required by the semantics below.

## Terminology

- **Feed identity:** The persisted identity of a user's source, distinct from the URL used to retrieve it.
- **Crawl run:** A user-scoped execution coordinating processing of eligible Feeds.
- **Feed execution:** Processing one Feed within a crawl run, including acquisition, parsing, item processing, and recording its outcome.
- **Acquisition attempt:** An individual retrieval attempt within a Feed execution. A Feed execution MAY include bounded retries or endpoint recovery.
- **Feed result:** The recorded outcome of a Feed execution, including available acquisition diagnostics and item-processing information.
- **User-configured automation:** Explicit rules configured by the owning user that apply supported changes to Articles.
- **Unchanged retrieval:** A retrieval known to represent previously accepted Feed content. It is distinct from a changed representation that happens to produce no Article changes.

## Ownership and crawl coordination

1. **Every Feed MUST belong to exactly one user.**
   Feed configuration and all work arising from it belong to that user. Articles, aliases, automation, crawl history, and downstream state must retain that ownership through reconciliation and processing.

2. **Every Feed execution MUST remain attributable to an identifiable Feed.**
   Retrieval attempts, errors, results, and accepted Articles must refer to the originating Feed or its reconciled successor. A location change must not sever the relationship between a source and its processing history.

3. **Conflicting executions MUST NOT mutate the same Feed as independent owners.**
   Scheduled, manual, retry, and recovery work may overlap in time, but must not produce contradictory ownership or allow superseded work to overwrite newer Feed or Article state. Work that has lost execution ownership must not make further crawl-owned mutations or finalize another execution's result.

4. **Abandoned execution ownership MUST be recoverable.**
   A crash or interrupted crawl must not permanently block a Feed. Coordination must distinguish active responsibility from abandoned work without allowing recovery to interfere with an execution that still owns its work.

## Resource and execution boundaries

1. **Crawler work MUST have finite resource and execution bounds.**
   Retrieval time, redirects, response size, parsing, item count, retries, endpoint recovery, and concurrent work must be limited. A slow or malformed Feed must not consume capacity indefinitely or prevent other Feeds from progressing.

2. **Nested work MUST respect the overall execution bounds.**
   Following another endpoint or retrying a failed operation must not repeatedly restart allowances so that a nominally bounded Feed execution becomes unbounded. Optional work performed within an execution is subject to the same principle.

## Feed acquisition

1. **Feed identity MUST remain distinct from Feed location.**
   A Feed URL is a location from which RSSMonster retrieves a source; the persisted Feed is the source identity. Redirects, discovery, aliases, publisher-declared URLs, and endpoint recovery may indicate that a location changed. They must not accidentally create a new logical Feed or merge unrelated Feeds.

2. **Accepting a replacement Feed location MUST require evidence of source continuity.**
   A reachable endpoint or publisher declaration is not unconditional authority to replace the accepted source. Reconciliation must establish that the candidate represents the same Feed, rather than merely another accessible Feed, while keeping legitimate moves possible.

3. **Legitimate endpoint changes and same-user Feed convergence MUST preserve the source's meaningful state.**
   Articles, configuration, user-owned state, and useful history must survive reconciliation. When records are established to represent the same user's source, convergence must preserve that relationship without discarding meaningful state merely because one record becomes authoritative. Feeds belonging to different users must remain separate.

4. **Known historical Feed URLs MAY remain aliases of the accepted Feed.**
   An alias expresses known source continuity, not an independent source or proof that every Feed at a similar URL is equivalent. Within a user's Feeds, a known alias must resolve consistently to the same logical Feed.

5. **Redirects and endpoint recovery MUST remain explainable.**
   Available diagnostics should distinguish the requested location, failed attempts, and the ultimately accepted location. Recovery must follow the resource and security boundaries even when an intermediate endpoint appears legitimate.

## Retrieval state and unchanged content

1. **Accepted retrieval state MUST describe an accepted Feed representation.**
   A successful network response alone does not establish that its contents are a valid Feed. Rejected or malformed content must not become the basis for treating that representation as previously accepted on a later crawl.

2. **Unchanged retrieval MUST remain distinct from absence of new Articles.**
   Unchanged means the retrieved Feed representation is already known. A changed Feed can contain only known items, filtered candidates, or duplicates and therefore produce zero Article changes. It can also revise existing Articles without creating any new ones. All of these can be successful crawls.

3. **Known unchanged retrieval SHOULD avoid unnecessary Article processing.**
   Recognizing the same accepted representation does not establish a publisher revision or authorize new interaction effects. It also must not be mistaken for proof that previously failed item or downstream work has succeeded.

4. **Successful retrieval MUST NOT imply successful Feed processing.**
   A response may be retrieved successfully but fail validation or parsing, or contain items that fail independently. Acquisition success and the result of processing accepted content must retain separate meanings.

## Feed parsing and normalization

1. **Supported Feed formats MUST preserve common Article-candidate semantics.**
   RSS, Atom, and other supported sources may express entries differently, but those differences must not redefine what identifies a publisher item or what its content means. Publisher identifiers, links, publication metadata, descriptions, bodies, categories, and media must retain their meaning and provenance through normalization.

2. **Parser tolerance MUST NOT fabricate publisher information.**
   Missing fields may use deterministic fallbacks where supported. A fallback or inferred value must not masquerade as publisher-supplied information when that distinction affects identity, reconciliation, or presentation.

3. **Malformed content MUST fail safely at the appropriate scope.**
   Unsafe or unusable values must not become trusted Article identity or content merely because they appeared in a Feed. An invalid Feed must not silently become Articles; an individually malformed item SHOULD be isolated when safe so it does not corrupt other items or prevent their valid processing.

4. **Item order and disappearance MUST NOT redefine Article identity or retention.**
   Publishers may reorder entries or remove older entries from a limited Feed window. Reordering must not create new Articles for known items, and disappearance alone must not delete stored Articles: a Feed is not an authoritative deletion list.

5. **Publisher, modification, inferred, crawl, and operational times MUST retain distinct meanings.**
   Crawl time describes RSSMonster's activity, not when a publisher created or revised an item. Known publisher times must not silently be replaced with processing times, and inferred dates must not claim stronger source authority than their inputs support.

6. **Article content representations MUST retain their distinct purposes.**
   Original source content, sanitized display content, normalized visible text, and publisher descriptions are separate contracts. Normalization must preserve useful source material without treating raw markup as safe display content or a description as interchangeable with the full body. Article representation semantics are defined by [semantic-system-contract.md](semantic-system-contract.md#articles).

7. **Ordinary Feed ingestion MUST NOT require downloading the linked Article webpage.**
   The Feed's supplied content must support ordinary ingestion even when the linked page is unavailable. Retrieving that page may be part of an explicitly configured acquisition method; it is not an implicit prerequisite for every Feed item.

## Feed-level filtering

1. **A Feed item filter MUST prevent a rejected new item from entering Article persistence.**
   Such a filter controls which incoming items are admitted. RSSMonster must not create an Article merely to record the rejection, and the rejected candidate must not become semantic, recommendation, or preference evidence. Crawl diagnostics may still record that filtering occurred.

2. **Feed item filtering MUST remain distinct from a user-configured discard action.**
   A discard action may intentionally retain an Article for identity and future reconciliation while excluding it from ordinary visibility and downstream contribution. Rejecting a new candidate at the Feed boundary and retaining a filtered Article are different outcomes, even when neither appears in the ordinary reading view.

3. **Feed item filtering MUST NOT retroactively change an existing Article by itself.**
   Failing the current admission filter does not authorize deleting, hiding, or changing a previously persisted Article. Such changes require a separate explicit rule. Filter rejection alone is not a user interaction or a statement of dislike.

## Article identity

1. **Publisher identity resolution and duplicate detection MUST remain separate decisions.**
   Publisher identity asks whether this is the same publisher item seen before. Duplicate detection asks whether a different publisher item represents content that should not become another independent canonical Article. Identity must be resolved before duplicate suppression can decide how to treat a distinct candidate; content equality alone must not cause an unrelated Article to be overwritten as a publisher revision.

2. **Trustworthy stable publisher identity MUST take precedence over weaker evidence.**
   RSS GUIDs, Atom IDs, and equivalent publisher identifiers identify entries within their user and Feed scope, not globally across unrelated sources. Partial URL coincidence, item order, or semantic similarity must not override stronger deterministic identity evidence.

3. **Fallback identity MUST be deterministic and preserve source scope.**
   Where a usable publisher identifier is absent, equivalent publisher input must resolve consistently. A fallback must not collapse unrelated items merely because they lack an identifier or share a weak attribute. The publisher identity and ownership rules in [semantic-system-contract.md](semantic-system-contract.md#articles) remain authoritative for Articles.

## Hash and representation semantics

1. **Hashes and equivalent comparison evidence MUST retain their defined purposes.**
   Evidence that a Feed representation is unchanged, that two bodies contain equal content, or that two URLs are equivalent answers different questions. Feed-representation, source-content, normalized-text, raw-URL, and normalized-URL comparisons must not be treated as interchangeable proof of publisher identity. This distinction does not require a particular hashing algorithm.

2. **Equivalent inputs MUST compare consistently under the applicable representation rules.**
   Normalization or hashing changes must preserve the distinction between publisher identity, content equality, and URL equality. An internal representation change must not by itself turn a known item into a newly discovered publisher item.

3. **Missing or empty input MUST NOT create misleading shared identity evidence.**
   Two items with no body have missing content, not proof of identical content. Empty values must not join unrelated Articles through a shared comparison value.

## Existing Article revisions

1. **A publisher revision MUST update the existing Article's source state while preserving its identity.**
   Once an item resolves to an existing publisher Article, meaningful corrections belong to that Article. Publisher-owned content and source metadata may change according to their authority; reconciliation must not recreate the Article or treat an internal extraction change as a new publisher revision.

2. **Publisher reconciliation MUST protect user-owned interaction and metadata state.**
   A corrected headline or body must not reset reading state, favorites, feedback, clicks, attention, interaction timestamps, manual tags, or equivalent user-owned state. Source authority does not grant authority over the user's actions.

3. **Sparse updates MUST NOT erase useful stored source content without evidence of intended removal.**
   A Feed may later supply only a description or omit previously available metadata. Absence or emptiness alone must not silently destroy the richer stored representation of the same item.

4. **A revision MUST NOT become a new ingestion event or replay creation-time effects.**
   Finding the same Article again does not justify reapplying an existing favorite, click-like action, or other committed automation effect. Revision reconciliation must preserve the replay guarantee even when source content has changed.

5. **Revisions MUST follow the semantic contract's source-correction boundary.**
   [semantic-system-contract.md](semantic-system-contract.md#articles) defines which existing analysis and semantic state revisions retain and prohibits revision-triggered re-enrichment or semantic reprocessing. Retained derived state refers to its previously analyzed representation; it must not be presented as newly computed from the correction. Independent ranking and personalization activity remains subject to that contract.

## Duplicate prevention

1. **Distinct new candidates MUST undergo deterministic duplicate suppression before becoming independent canonical Articles.**
   A deterministically suppressed candidate must not become an additional canonical Article merely because it has a different publisher identifier. Deterministic identity and content evidence take precedence over semantic fallback, without prescribing a particular lookup strategy.

2. **Duplicate content MUST remain distinct from similar coverage.**
   Similar titles, shared subjects, or reporting on the same occurrence do not by themselves establish duplication. Any title-based fallback must be conservative and supported by sufficient evidence; separate reporting may remain independently canonical.

3. **Deterministic suppression and later semantic duplicate classification MUST retain distinct outcomes.**
   A semantic duplicate may first exist as a persisted Article and later lose independent semantic and recommendation contribution when classified. Crawl processing may initiate that classification, but canonical eligibility, valid duplicate relationships, and suppression of duplicate Event, Island, and preference evidence are defined by [semantic-system-contract.md](semantic-system-contract.md#articles). A persisted duplicate must not multiply evidence simply because it exists as another record.

## User-configured automation

1. **Automation MUST represent explicit user configuration rather than inferred behavior.**
   Rules may intentionally favorite, filter or discard, tag, or override a score for matching Articles. Crawling or matching content is not itself an interaction; the configured action supplies the authority for the resulting change. Automation may change only the state governed by that action.

2. **Rule-created preference evidence MUST reside on the Article and retain the configured action's meaning.**
   A rule-applied favorite may supply Article-level preference evidence without a later click or read because the user explicitly configured it. It does not imply that the Article was read, and a tag or score override must not automatically become a favorite or reading signal. Article and Island evidence semantics, including the effect of removing a rule, are defined by [semantic-system-contract.md](semantic-system-contract.md).

3. **Encountering an Article again MUST NOT renew an unchanged automation outcome.**
   Applying the same favorite again must not refresh its interaction time or count it as fresh Island support. Equivalent rules and Article input should produce equivalent actions, subject to the replay guarantee; newly matching canonical Articles may provide distinct rule-created preference evidence under the semantic contract.

4. **Discard automation MAY preserve Article identity while excluding ordinary participation.**
   A retained discarded Article can support later recognition and reconciliation without remaining visible in ordinary reading or independently contributing to semantic, preference, or recommendation evidence. Its persistence does not override the filtered-Article eligibility rules in the semantic contract.

5. **User-configured overrides MUST retain their authority over automatically derived values.**
   An inferred value must not silently replace an explicit override. Deterministic automation must remain usable without optional AI inference unless the configured feature explicitly defines AI-dependent rule semantics.

## Tags and metadata provenance

1. **Metadata origins MUST remain distinguishable where they affect authority or reconciliation.**
   Publisher, Feed, automation, manual, and inferred metadata may describe the same Article but have different authority. Reprocessing must not silently convert one origin into another or present generated metadata as publisher or user input.

2. **Metadata reconciliation MUST preserve protected higher-authority state.**
   Later derived processing must not overwrite a manual value or configured override unless explicitly allowed. Equivalent values from multiple sources must reconcile consistently while retaining the provenance needed for subsequent decisions.

## Article persistence

1. **Downstream work MUST rely on durably persisted Article identity and valid state.**
   Essential creation state must become available consistently, so downstream processing cannot observe an invalid partially created Article. A transient parsed item or attempted write is not a successfully ingested Article, and partial Article work must not be reported as complete persistence.

2. **Already committed independent Articles MUST survive later failures.**
   Feed processing is not one giant all-or-nothing transaction. Failure of another item, a later Feed operation, or downstream work must not undo independent committed Articles. Work required to establish one valid Article may still succeed or fail together.

3. **Concurrent processing of the same resolved publisher item MUST converge on one authoritative Article.**
   Retries or simultaneous ingestion must recognize the authoritative persisted identity rather than create competing Articles or apply the same creation effects independently. This guarantee is independent of the storage or coordination mechanism.

## Crawl results and operational state

1. **Every completed Feed execution MUST have an observable outcome grounded in what happened.**
   Results must distinguish retrieval failure, unchanged retrieval, changed content with no new Articles, existing Article revisions, filtering, duplicates, item failures, and successful Feed processing where known. These facts may coexist: a Feed can be successfully retrieved, create some Articles, and fail on another item. A single success label must not conceal partial failure.

2. **Current health and scheduling state MUST NOT rewrite retained history.**
   A successful recovery may clear a current error while preserving earlier failed attempts and executions. Historical diagnostics may be bounded by an explicit retention policy, but a later success must not retroactively convert failure into success. A failed crawl likewise must not invalidate previously accepted useful source state.

3. **Crawl statistics MUST describe recorded processing facts rather than current Article totals.**
   Articles may later be deleted, filtered, or classified as duplicates independently of crawling. Current counts therefore cannot alone establish how many items a past execution created, revised, rejected, or failed to process.

4. **Operational timestamps MUST retain their distinct meanings.**
   Attempt time, successful acquisition time, accepted representation change, and execution completion describe different events. A changed representation does not prove an Article changed, and a completion timestamp does not establish when the publisher changed its content.

5. **Successful unchanged retrieval MUST be capable of restoring acquisition health.**
   Recognizing an accepted representation can establish that retrieval is healthy again without claiming new Articles were discovered. It does not establish that unrelated item-processing or downstream failures have been resolved.

## Failures, retries, and recovery

1. **Failures MUST be classified according to available evidence.**
   Retrieval, validation, parsing, item processing, persistence, and optional downstream failures should remain distinguishable when known. Transient failure, rate limiting, malformed input, prohibited retrieval, and configuration problems imply different recovery needs; diagnostics must not claim certainty beyond the evidence.

2. **Retries MUST follow bounded execution and explicit scheduling policy.**
   Immediate attempts and endpoint recovery remain within the resource bounds. Later attempts may continue under scheduling policy, respecting applicable publisher freshness, server retry guidance, backoff, quarantine, and disabled automatic fetching. A failure must not cause uncontrolled retry activity.

3. **Recovery MUST NOT depend solely on process memory.**
   Restarting RSSMonster must leave persisted Feed and Article state recoverable. Resumed work is subject to the persistence and replay guarantees, so recovery can complete missing work without invalidating independent committed work or repeating its effects.

4. **Crash recovery MAY record an explicit abandoned-execution failure.**
   Recovery must not invent successful completion or unobserved item outcomes. The time abandonment is detected is not proof of when source processing ended.

## Downstream semantic processing

1. **Successful ingestion MUST remain independent of semantic processing success.**
   Crawling may cause embeddings, semantic duplicate detection, Event assignment, or interest scoring, but failure to initiate or complete them must not invalidate a valid Article. Missing embeddings, Events, or Islands must not prevent persistence, readability under the applicable visibility rules, or general recommendation eligibility.

2. **Semantic work MUST use persisted Article identity and state under the semantic contract.**
   [semantic-system-contract.md](semantic-system-contract.md) defines eligible inputs, compatible representations, duplicate contribution, Event membership, Island evidence, and scoring. Crawling must not substitute transient candidate state or bypass those rules. Scheduling downstream work does not authorize processing a revision that the revision contract excludes.

3. **Event processing and personalization MUST remain independent concepts.**
   Event assignment organizes occurrences and must not become preference evidence or imply user interaction. Interest scoring must not require Event membership; an otherwise eligible standalone Article remains eligible, with neutral interest when no trustworthy preference evidence applies. The semantic contract governs how Article evidence may contribute, including duplicate exclusions.

4. **Optional downstream work SHOULD be recoverable from sufficient persisted input.**
   A semantic failure should not require downloading the source again solely to reconstruct already retained input. Recovery remains subject to the revision and replay rules; it does not authorize fresh evidence or reanalysis merely because processing was retried.

5. **Crawl completion MUST NOT imply completion of all derived processing.**
   Source ingestion, semantic processing, and AI enrichment have distinct outcomes. A successfully ingested Article may still lack optional derived state, and semantic computation itself is neither another retrieval nor a user interaction.

## AI enrichment

1. **AI enrichment MUST remain distinct from source ingestion and semantic processing.**
   Enrichment may derive summaries, analysis, or inferred metadata about an Article. Those outputs do not redefine publisher content, establish user intent, or independently determine semantic eligibility. AI failure must not invalidate the Article or make successful inference a prerequisite for recommendation.

2. **Enrichment MUST apply only to the specific Article representation it analyzed.**
   A result based on older source content must not overwrite a newer revision. Obsolete work must be rejected, discarded, or retained only as obsolete, rather than applied as current analysis. This does not require removing already stored analysis that the revision contract deliberately preserves, nor does it authorize revision-triggered re-enrichment.

3. **Generated state MUST remain distinguishable from publisher and user-owned state.**
   Summaries, inferred tags, and analysis must retain the provenance needed to identify them as generated and respect protected metadata and configured overrides. Missing analysis must remain distinguishable from an observed zero or negative result, with ranking fallbacks governed by the semantic contract.

4. **Repeated inference MUST preserve the replay guarantee.**
   Retrying equivalent enrichment may complete missing derived state, but must not multiply tags, accumulate the same score contribution, or create preference evidence. Inference activity itself is not evidence that the user read, favored, or otherwise interacted with the Article.

## Security and isolation

1. **Remote Feed content MUST be treated as untrusted input.**
   Responses, redirects, headers, URLs, markup, and metadata require appropriate validation before use. Publisher text must not become application instructions or acquire authority over configuration, privileged processing, automation, or user actions, including when supplied to AI enrichment.

2. **All server-side acquisition MUST respect URL and network safety boundaries.**
   User-supplied locations, redirects, discovered endpoints, publisher declarations, and nested retrieval must not enable access to prohibited resources. Accepting an earlier location does not automatically make a later target safe.

3. **Raw publisher markup MUST NOT be assumed safe for presentation.**
   Preserving original content serves source fidelity, not permission to render it unsanitized. Display representations must satisfy the Article-content safety boundary independently of whether acquisition and parsing succeeded.

4. **Credentials and private transport details MUST NOT leak into diagnostics or publisher content.**
   Exposed results and logs must exclude or redact authentication material, sensitive URL components, and unnecessary private infrastructure details. Secrets added by RSSMonster to retrieve a Feed must not become stored source text or publisher metadata.

5. **User isolation MUST hold through indirect paths as well as direct access.**
   Identity lookups, duplicate matching, aliases, automation, diagnostics, and downstream evidence must respect the Feed's ownership boundary. One user's configuration must not expose or influence another user's private Articles, crawl history, preferences, or recommendation state.

## Replay safety and determinism

1. **Running the same crawl against materially unchanged source state MUST NOT create additional identity or effects.**
   With unchanged applicable configuration, repeated processing must not create additional Articles, favorites, clicks, tags, preference evidence, semantic evidence, or equivalent side effects. It must not refresh interaction timestamps or make old evidence appear new. A retry may finish previously missing work, but an already committed outcome must not be counted again.

2. **Replay correctness MUST survive changes in execution conditions.**
   Caches, retries, parallelism, process restarts, and scheduling may affect cost and timing, but must not weaken identity, ownership, persistence, or replay guarantees. Supported implementations must preserve these semantics regardless of their internal execution or storage strategy.

3. **Equivalent input and configuration SHOULD produce equivalent crawl decisions.**
   Incidental processing order must not supply identity or user intent. Genuine changes in source, configuration, or applicable state may change an outcome; repeated observation alone does not establish such a change.

## Traceability and observability

1. **Material crawl decisions MUST be explainable from their inputs.**
   Feed selection, endpoint reconciliation, filtering, identity resolution, duplicate suppression, automation, revision handling, and downstream eligibility should have identifiable reasons. Available diagnostics must distinguish attempted processing from deferral, disabled fetching, quarantine, or execution-ownership conflicts where known.

2. **Accepted Articles MUST retain Feed provenance.**
   RSSMonster must be able to identify the source of an Article after ingestion and legitimate Feed reconciliation. Execution-level attribution may also be retained when established reliably; missing correlation must not be replaced with invented attribution.

3. **Operational records MUST NOT become publisher or behavioral evidence.**
   Logs, statistics, traces, and health state support explanation, scheduling, and recovery. They must not manufacture publisher revisions or user interactions, or independently supply semantic or preference support merely because an operation was observed.
