# SEMANTIC SYSTEM INVARIANTS

Articles own publisher identity, current content, and processing state. ArticleInteractions own per-Article user state and behavioral preference evidence. Events organize Article content. Islands represent signed user preference derived from ArticleInteraction evidence interpreted through the associated Article representation. Recommendations combine Article properties with optional user affinity.

## Events

1. **An Event represents one concrete real-world occurrence.**

   Shared subjects, entities, or user interests alone do not establish an Event.

2. **Event formation and membership MUST NOT depend on user behavior.**

   Events derive from Article content and occurrence evidence. ArticleInteraction reading state, favorites, clicks, feedback, attention, and personal scores must not determine which Articles belong together.

3. **An Event MUST contain at least two canonical Articles.**

   Events that no longer meet this requirement must not remain active as valid Events.

4. **An Event and all its member Articles MUST belong to the same user.**

   Candidate searches, assignment, aggregation, and retrieval must preserve that ownership boundary.

5. **Membership requires evidence of the same occurrence.**

   Semantic similarity alone must not override incompatible occurrence evidence.

6. **Missing occurrence evidence is neutral.**

   An omitted location, version, entity, or other occurrence attribute is neither agreement nor contradiction.

7. **The complete Event MUST satisfy its temporal boundary.**

   Successive nearby Articles must not extend an Event indefinitely.

8. **Ambiguous Articles MUST remain unassigned.**

   When multiple Events qualify without a clear winner, assignment must not be forced.

9. **A qualifying existing Event MUST be reused before another Event is created.**

   Reuse remains subject to the same occurrence-evidence, temporal-boundary, and ambiguity requirements.

10. **Events MUST NOT have personal interest or recommendation scores.**

    Non-personal measures such as coverage, source diversity, corroboration, and Event strength are permitted.

11. **Each Event MUST have a deterministic display-name fallback and MAY have an AI-generated label.**

    The fallback must remain available when the generated label is absent or unusable. Generated labels are presentation metadata and must not independently determine membership or ranking.

12. **Each Event MUST have a valid `representativeArticleId` pointing to a canonical member that serves as its stable anchor.**

    Normal incremental processing must not replace a valid representative when newer Articles join. An invalid or missing representative must be repaired.

13. **Each Event MAY have a `developingArticleId` pointing to a canonical member.**

    This pointer represents the current developing coverage wave for presentation and does not redefine Event identity.

14. **Behavior-dependent presentation MUST NOT change Event membership.**

    Developing-story selection and grouping preferences must remain separate from occurrence detection.

15. **Event summaries MUST remain consistent with canonical membership.**

    Counts, source diversity, coverage windows, aggregate vectors, and other Event-level state must derive only from current and active canonical member Articles.

16. **Event comparisons MUST use compatible semantic representations.**

    Missing, invalid, unknown, or incompatible embedding models and dimensions must not provide Event-matching evidence.

17. **Membership changes MUST be atomic and revalidated before persistence.**

    Concurrent processing must not leave conflicting assignments, invalid Events, or summaries inconsistent with membership.

18. **Candidate evaluation MUST be bounded.**

    Insufficient evidence within the bounded candidate set is an acceptable outcome; forced clustering is not.

---

## Interest Islands

1. **Islands MUST represent demonstrated, signed user preferences.**

   An Island represents positive interest or negative preference supported by direct interactions or user-configured rules.

2. **Island evidence MUST originate from user interactions or user-configured preference rules.**

   Supported evidence includes explicit likes, explicit dislikes, favorites, clicks, meaningful reading engagement, and equivalent actions applied by user-created rules.

3. **User-configured rules MUST be able to establish and reinforce Islands without subsequent interaction.**

   For example, a rule that automatically favorites Articles containing “Zelda” must allow matching Articles to contribute positive evidence toward an Island without requiring the user to open or read them.

4. **Article availability alone MUST NOT create or strengthen an Island.**

   Receiving, crawling, storing, or displaying Articles is not preference evidence. An Article matching an explicit user-configured preference rule is not mere availability.

5. **Unread state, short reads, and absence of engagement MUST NOT become negative evidence.**

   Missing interaction establishes neither interest nor dislike.

6. **Islands MUST work independently from Events.**

   Event membership must not be required for Island formation, matching, updating, decay, lifecycle management, or contribution to recommendation scoring.

7. **Events MUST NOT create or reinforce preference evidence.**

   Event existence, Event membership, Event size, Event strength, Event vectors, Event summaries, or other Event-derived properties must not independently establish, strengthen, weaken, or reactivate an Island.

8. **ArticleInteraction MUST remain the source of behavioral preference evidence.**

   Eligible user interactions and rule-applied signals stored on ArticleInteraction may influence an Island regardless of whether the associated Article belongs to an Event. Article supplies the semantic representation used to interpret the behavioral signal; Article itself is not behavioral evidence.

9. **Events MAY be used only to normalize correlated Article evidence.**

   When multiple interacted Articles belong to the same Event, their combined contribution may be bounded or subject to diminishing returns so repeated coverage of one occurrence does not disproportionately influence an Island.

10. **Event normalization MUST NOT fabricate additional evidence.**

    Interaction with one Article in an Event must not be propagated to the Event’s other Articles or treated as interaction with the Event as a whole.

11. **Multiple genuine interactions within the same Event MAY provide stronger evidence, but MUST NOT scale linearly without bound.**

    Repeated engagement with distinct canonical Articles about the same occurrence may increase confidence or preference strength, while correlation-aware saturation prevents publisher volume from dominating the user profile.

12. **Explicit Article-level feedback MUST retain its normal strength regardless of Event membership.**

    A strong explicit action such as a like, dislike, favorite, or equivalent user-configured preference signal must not be weakened merely because the Article belongs to a large Event.

13. **Island formation MUST remain valid when Events are unavailable or removed.**

    Islands must be learnable and reconstructable from ArticleInteraction preference evidence and the associated Article representations without requiring Event state. Event information may improve evidence normalization but must not define the underlying preference.

14. **Events may identify correlation between behavioral observations, but MUST NOT constitute behavioral observations themselves.**

    Event structure may constrain how repeated evidence is aggregated but must never substitute for actual user interaction or a user-configured preference rule.

15. **Islands MUST support positive and negative weights.**

    Positive evidence can establish or reinforce attraction. Negative evidence can weaken positive preference or establish and reinforce aversion.

16. **Island weights MUST reflect the strength and accumulated support of their evidence.**

    With comparable recency and semantic coherence, many explicit likes must provide stronger positive influence than a few incidental clicks. Weighting may use averaging, saturation, and bounded breadth; each additional positive interaction need not increase the stored weight.

17. **Preference strength, Island confidence, and Article-to-Island relationship confidence MUST remain distinct.**

    Strength describes the signed preference, Island confidence describes its evidential support, and relationship confidence describes its applicability to a candidate Article.

18. **A single weak interaction MUST NOT establish a strong persistent preference.**

    Stronger influence requires sufficient supporting evidence or an explicit high-confidence signal, including a user-configured preference rule.

19. **Explicit feedback MUST take precedence over contradictory weak inference in the same interaction context.**

    An explicit dislike must not be neutralized merely by a long dwell time. Later evidence and defined decay may change the resulting preference.

20. **Both positive and negative preferences MUST decay without renewed supporting evidence.**

    Historical preferences must not retain permanent influence solely because they once existed.

21. **Unknown interaction age MUST NOT grant permanent influence.**

    Missing timestamps require a defined aging policy. Calibration time and technical update timestamps must not manufacture fresh preference evidence.

22. **Recent evidence MUST be capable of outweighing older evidence.**

    Historical preferences must not permanently dominate the user’s profile.

23. **Each user MUST have at most `MAX_INTEREST_ISLANDS` active Islands after a successful persistence transaction.**

    Archived or dormant Islands do not count toward this limit. New and reactivated preferences must compete for capacity without relaxing semantic eligibility.

24. **New preferences MUST be learnable without manual removal of old Islands.**

    The lifecycle must support replacement, dormancy, archival, or consolidation to make room for sufficiently supported new preferences.

25. **Inactive preferences MUST NOT consume active capacity indefinitely.**

    Islands whose evidence no longer supports meaningful current preference must eventually leave the active set.

26. **Dormant or archived Islands MAY reactivate through renewed supporting evidence.**

    Reactivation must reuse the existing identity when appropriate, satisfy lifecycle requirements, and compete for active capacity. Replaying old evidence alone must not reactivate an Island.

27. **Island names MUST be unique within a user’s Islands.**

    Naming collisions must be resolved deterministically. Renaming must not change preference evidence, weight, or semantic identity.

28. **Distinct Islands belonging to the same user MUST maintain a minimum semantic vector distance within a compatible embedding space.**

    Identical or near-identical vectors must not persist as separate Islands. The distance metric and minimum separation threshold must be explicitly defined and enforced during creation, updates, and reactivation. Vector proximity alone MUST NOT establish semantic identity between Islands.

29. **Vector-separation enforcement and consolidation MUST preserve all preference evidence semantics.**

    Resolving overlapping Islands must not silently discard positive or negative evidence or erase meaningful differences in preference intent. Survivor selection must preserve the signed evidence represented by both Islands, including evidence strength, confidence, recency, provenance, lifecycle state, and other information required to reproduce the resulting preference semantics. A higher current weight alone must not justify discarding evidence from the other Island.

30. **Duplicate records and repeated processing MUST NOT multiply preference evidence.**

    Distinct genuine interactions and newly matched canonical Articles under a user-configured rule may reinforce the same preference. Reprocessing the same Article and unchanged rule outcome must not count as fresh evidence.

31. **Calibration MUST be replay-safe.**

    Reprocessing unchanged evidence must not manufacture additional preference strength, refresh behavioral timestamps, or create duplicate Islands.

32. **Island state and lifecycle decisions MUST be explainable from their supporting evidence.**

    Explanations must identify relevant interactions or user-configured rules and distinguish behavioral changes, decay, capacity decisions, and semantic consolidation. Explanation-retention limits must be explicit.

33. **Island semantics MUST remain user-specific.**

    One user’s interactions, rules, and preferences must not contribute evidence to another user’s Islands.

34. **Unmatched behavioral evidence MAY remain outside Islands.**

    Capacity must never justify a below-threshold semantic match or force unrelated evidence into an existing Island.

35. **Semantic comparisons MUST use compatible embedding models and dimensions.**

    Unknown or incompatible vector spaces must not supply matching, consolidation, or vector-distance evidence.

36. **Derived scores, audit records, and generated labels MUST NOT become new behavioral evidence.**

    Reusing a previous calculation or explanation must not create a feedback loop that strengthens the preference it describes.

37. **Personalization and recommendation scoring MUST support signed results.**

    Positive preferences may increase scores; negative preferences may decrease them. Negative results must not be discarded solely because they are negative.

38. **Recommendation eligibility MUST NOT require an Island match.**

    When no trustworthy personalization evidence exists, interest must be neutral. Every otherwise eligible Article must still receive a finite Recommended score.

39. **Islands MUST NOT determine Event identity or objective content clustering.**

    Personal preferences must not change which Articles describe the same real-world occurrence.

40. **Implementation changes MUST preserve these semantics.**

    Models, thresholds, weighting formulas, decay functions, representations, and algorithms may change without redefining what an Island represents or weakening these boundaries.

---

## Articles

1. **Publisher content and source metadata MUST remain authoritative source material.**

   AI summaries, labels, embeddings, scores, and semantic relationships must not overwrite or redefine what the publisher supplied.

2. **Original content and derived representations MUST remain distinct.**

   Raw source, sanitized display content, normalized visible text, and publisher descriptions have separate purposes and must not be treated as interchangeable.

3. **Publisher revisions MAY update an existing Article without changing its identity.**

   Updated reporting from the same publisher entry must not automatically become a new Article or a duplicate.

4. **Publisher updates MUST preserve user-owned interaction state.**

   Revisions must not reset the associated ArticleInteraction reading state, favorites, feedback, clicks, or interaction timestamps. Manually assigned tags must also be preserved.

5. **Missing or empty publisher fields MUST NOT erase meaningful stored values without explicit justification.**

   Sparse feed updates must not silently remove existing content or metadata.

6. **Each Article MUST belong to a user and a source feed.**

   Identity resolution, deduplication, semantic processing, and retrieval must respect ownership boundaries.

7. **Publisher identity MUST be resolved before duplicate-content suppression.**

   Identifying the same publisher entry and identifying equivalent content are different decisions.

8. **Stable publisher identifiers MUST be used when available.**

   RSS GUIDs, Atom IDs, and equivalent provider identifiers must be interpreted within their user and feed scope. They are not globally unique across unrelated feeds.

9. **Deterministic identity and content evidence MUST take precedence over semantic similarity.**

   Provider identifiers, appropriate URL identities, and content hashes must be evaluated before semantic duplicate fallback.

10. **Hashes MUST represent their defined source consistently.**

    URL hashes, original-content hashes, and normalized-text hashes must remain distinct. Missing content must not produce a shared empty-content identity that falsely joins unrelated Articles.

11. **Semantic duplicate detection MUST be conservative.**

    When deterministic checks do not resolve duplication, near-identical Articles for the same user may be flagged as duplicates using an explicitly defined similarity threshold and bounded candidate search.

12. **Semantic Article comparisons MUST use compatible representations.**

    Missing, invalid, unknown, or incompatible embedding models and dimensions must not establish duplicate identity or other Article-level semantic relationships.

13. **Similar subject matter or shared Event membership MUST NOT establish duplication.**

    Separate reporting about the same occurrence may remain distinct canonical Articles.

14. **A retained duplicate MUST reference one valid canonical Article owned by the same user.**

    Duplicate relationships must not contain self-references, cycles, or chains of duplicate representatives.

15. **Duplicates MUST NOT independently multiply semantic or preference evidence.**

    Duplicate records must not inflate Event membership, Island support, or recommendation evidence. Duplicate classification must not fabricate user interactions.

16. **An Article MAY belong to an Event, but MUST NOT require one.**

    Standalone Articles are valid and must remain readable, searchable, and eligible for recommendation under the applicable visibility rules.

17. **An Article MUST belong to at most one Event.**

    `Article.eventId` is the authoritative membership relationship.

18. **Event assignment MUST preserve ArticleInteraction state.**

    Joining an Event must not mutate ArticleInteraction to mark the Article read or inherit another Article’s read state, favorites, feedback, clicks, or engagement.

19. **Articles MUST work independently from Islands.**

    Missing Islands or unmatched personalization must not prevent Article ingestion, storage, presentation, or recommendation eligibility.

20. **An eligible ArticleInteraction MUST be able to influence an Island without an Event.**

    Its interaction and preference evidence, interpreted using the associated Article representation, may contribute regardless of Event membership, subject to semantic eligibility and Island capacity.

21. **Article MUST NOT own interaction or preference evidence.**

    Clicks, favorites, explicit likes and dislikes, reading engagement, and the timestamps needed to interpret those signals reside in the associated ArticleInteraction. Article retains identity, content, processing, and Event responsibilities.

22. **User-configured preference rules MUST be able to create ArticleInteraction preference evidence.**

    A rule-applied favorite or equivalent supported action must be recorded on ArticleInteraction and may influence Islands without requiring a subsequent click or read.

23. **Repeated ingestion MUST NOT manufacture fresh behavioral evidence.**

    Re-crawling, revising, re-embedding, or rescoring an Article must not refresh ArticleInteraction timestamps or repeatedly count an unchanged rule outcome.

24. **Read state MUST remain distinct from demonstrated reading engagement.**

    Marking an Article read, including through an Event-wide action, must not fabricate clicks, reading time, or completion evidence.

25. **Unread state, short reads, and absent engagement MUST NOT imply dislike.**

    Negative preference requires a recognized negative signal.

26. **Personal interest MUST support positive, negative, and neutral values.**

    Missing trustworthy personalization evidence must produce neutral interest rather than an inferred dislike.

27. **Every otherwise eligible Article MUST receive a finite Recommended score.**

    Event membership, Island matches, embeddings, and nonzero interest must not be prerequisites.

28. **A missing personalization signal MUST NOT imply a zero-value Article.**

    Quality, freshness, source evidence, and other defined ranking inputs remain applicable without personalization.

29. **Crawl enrichment MUST supply available ranking inputs without making successful AI enrichment a prerequisite for recommendation.**

    Missing analysis must use defined fallback behavior. Scores must be refreshable as time, behavior, and preference evidence change.

30. **Recommendation scores MUST support positive and negative results.**

    Negative preferences may lower the final score below zero; negative results must not be discarded solely because they are negative.

31. **Quality, personal interest, source trust, and Event evidence MUST remain distinct scoring concepts.**

    A disliked Article is not necessarily low quality, and strong corroboration does not establish personal interest.

32. **Derived scores MUST NOT become new interaction evidence.**

    Recommendation scores, interest scores, embeddings, generated summaries, and labels must not recursively reinforce the preferences that produced them.

33. **Ranking MUST remain separate from eligibility and visibility.**

    A high score must not bypass ownership, filtering, or duplicate restrictions. A low score alone must not delete or invalidate an Article.

34. **Reprocessing MUST preserve identity and avoid duplicate side effects.**

    Retries and concurrent ingestion must not create additional Articles for the same resolved identity or repeatedly apply the same behavioral contribution.

35. **Derived Article state MUST remain traceable to its inputs.**

    Duplicate decisions, semantic relationships, and scoring must have identifiable supporting evidence. Source revisions must not leave derived state falsely represented as current.

36. **Semantic timestamps MUST have explicit meanings.**

    Publication time, publisher update time, first-seen time, interaction time, recording time, and processing time MUST remain distinct.

37. **Technical timestamps MUST NOT substitute for unknown semantic timestamps.**

    In particular, crawl/processing time MUST NOT become publication time, occurrence time, or evidence time.

---

## ArticleInteraction

1. **Each Article MUST have exactly one ArticleInteraction belonging to the same user.**

   Article creation must initialize both records atomically. `ArticleInteraction.articleId` identifies the owning Article and `ArticleInteraction.userId` must match `Article.userId`.

   The interaction row's existence alone is not evidence of engagement. Ownership must be enforced for direct access, joins, and writes.

2. **ArticleInteraction MUST own mutable reading, engagement, and feedback state.**

   Reading state, favorites, clicks, explicit positive and negative feedback, attention state, and their interaction timestamps belong to ArticleInteraction.

   ArticleInteraction is a current-state model. This split does not introduce revision snapshots, immutable behavioral events, or a separate interaction history.

3. **ArticleInteraction MUST be the behavioral input to Interest Islands.**

   Eligible behavioral preference evidence stored on ArticleInteraction may establish, reinforce, weaken, decay, or reactivate Islands according to the existing Island rules.

   The associated Article supplies the semantic representation used to interpret that evidence.

4. **ArticleInteraction MUST NOT determine Event identity or Event membership.**

   Reading state, favorites, clicks, feedback, attention, personal interest, or other interaction state must not determine whether Articles describe the same occurrence or belong to the same Event.

5. **ArticleInteraction state MUST survive Article revisions and reprocessing.**

   Updating publisher content, semantic representations, Event assignment, duplicate state, enrichment, or other Article processing state must not reset or fabricate ArticleInteraction state.

6. **ArticleInteraction timestamps MUST retain their behavioral meaning.**

   Interaction timestamps describe user state or user activity. Article publication, revision, crawl, enrichment, and processing timestamps must not replace them.

7. **The existence or technical update of ArticleInteraction MUST NOT itself become preference evidence.**

   Creating the required interaction row, persisting derived caches, or updating technical timestamps must not manufacture clicks, reads, favorites, feedback, or fresh Island evidence.

8. **Derived ArticleInteraction scores MUST remain distinct from evidence.**

   `interestScore` is a derived cache and `interestScoredAt` is computation time. Neither is a user interaction and neither may independently establish or reinforce an Island.

---

## Change Validation

1. **Semantic implementation changes MUST be evaluated against a before-change baseline.**

   The same representative Articles, ArticleInteractions, rules, and other non-target configuration must be processed before and after the change.

2. **Before-and-after results MUST be compared using contract-relevant outcomes.**

   Comparisons must cover the affected assignments, scores, evidence, lifecycle states, counts, and invariant violations—not only whether tests execute successfully.

3. **Expected behavioral differences MUST be declared and tested explicitly.**

   Changes outside the intended scope must be treated as potential regressions and investigated.

4. **The after-change result MUST satisfy all invariants.**

   An improvement in an aggregate metric must not justify ownership violations, fabricated evidence, forced relationships, invalid lifecycle state, or other contract breaches.

5. **Comparison tests MUST tolerate permitted algorithmic variation without hiding semantic regressions.**

   Tests should assert stable contracts, boundaries, and meaningful outcome ranges rather than incidental ordering or exact internal values unless those values are themselves contractual.
