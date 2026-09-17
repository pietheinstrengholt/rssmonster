# SEMANTIC SYSTEM INVARIANTS

Articles are the behavioral evidence unit. Events organize content. Islands represent signed user preference. Recommendations combine Article properties with optional user affinity.

## Events

1. **An Event represents one concrete real-world occurrence.**
   Shared subjects, entities, or user interests alone do not establish an Event.

2. **Event formation and membership MUST NOT depend on user behavior.**
   Reading, favorites, clicks, feedback, and recommendation scores must not determine which Articles belong together.

3. **An Event MUST contain at least two canonical Articles.**
   Members counted toward Event validity MUST exist, belong to the Event’s owner, be unfiltered, and have no `duplicateOfArticleId`. Read/unread state does not affect membership eligibility. When an Event has fewer than two eligible canonical members, its remaining Articles MUST become eventless and the Event MUST stop contributing grouping and ranking evidence.

4. **An Event and all its member Articles MUST belong to the same user.**
   Candidate searches, assignment, aggregation, and retrieval must preserve that ownership boundary.

5. **Membership requires evidence of the same occurrence.**
   Semantic similarity alone must not override incompatible occurrence evidence.

6. **Event membership MUST use vector similarity together with supporting evidence and eligibility checks.**
   Vector similarity is the primary matching signal. Headline and entity overlap and recognized occurrence details from Article titles and descriptions provide additional evidence; ownership, canonical eligibility, temporal boundaries, and embedding compatibility constrain assignment. Recognized conflicting locations or product versions may reject an otherwise strong vector match. Missing or unrecognized occurrence details MUST remain neutral: they establish neither agreement nor contradiction, and matching must rely on the available evidence.

7. **The complete Event MUST satisfy its temporal boundary.**
   The span between the earliest and latest member Article times MUST be strictly less than the configured Event window. Use `publishedAt`, falling back to `createdAt` when publication time is unusable. Successive nearby Articles must not extend an Event indefinitely.

8. **Ambiguous Articles MUST remain unassigned.**
   When multiple existing Events qualify without the configured winning margin, the Article MUST remain eventless and MUST NOT seed a competing Event during that assignment attempt. Exact ties remain ambiguous even when the configured margin is zero.

9. **A qualifying existing Event MUST be reused before another Event is created.**
   Reuse remains subject to the same occurrence-evidence, temporal-boundary, and ambiguity requirements. New Event creation is considered only when no existing candidate qualifies, not as a way to resolve ambiguous existing matches.

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
    Counts, source diversity, coverage windows, aggregate vectors, and other Event-level state MUST derive only from current members satisfying the eligibility definition in Event rule 3. Read Articles remain eligible contributors.

16. **Event comparisons MUST use compatible semantic representations.**
    Missing, invalid, unknown, or incompatible embedding models and dimensions must not provide Event-matching evidence.

17. **Membership changes MUST be atomic and revalidated before persistence.**
    Concurrent processing must not leave conflicting assignments, invalid Events, or summaries inconsistent with membership.

18. **Candidate evaluation MUST be bounded.**
    Insufficient evidence within the bounded candidate set is an acceptable outcome; forced clustering is not.

19. **Event matching MAY use alternative evidence routes with configured thresholds.**
    Satisfying any one route provides matching support; satisfying every route is not required.

    | Matching route | Required evidence |
    | --- | --- |
    | Normal vector match | Vector similarity meets the normal threshold, together with sufficient headline-word overlap or shared entity hints. |
    | Very strong vector match | Vector similarity meets the stronger threshold; shared headline words or entity hints are not required. |
    | Almost identical headline | Headline-word overlap meets the near-identical threshold, together with vector similarity meeting the threshold for this route. |

    Required vector and textual support MUST come from the same comparison against the Event representation or a supporting member Article. Every route remains subject to ownership, canonical eligibility, temporal boundaries, embedding compatibility, occurrence-conflict checks, and ambiguity handling. Meeting a route’s thresholds alone does not guarantee assignment.

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

8. **Article interactions MUST remain the source of behavioral preference evidence.**
   Island formation, weights, decay, and lifecycle decisions MUST derive their behavioral evidence from the Article-level interaction columns defined below. Eligible user interactions and rule-applied Article signals may influence an Island regardless of whether the Article belongs to an Event.

   | Article columns | Meaning for Island evidence |
   | --- | --- |
   | `readAt` | Read-state timing and context; marking an Article read alone does not establish meaningful reading or preference. |
   | `firstSeen` | First actual exposure and its timing; exposure alone does not establish preference. |
   | `favoriteInd`, `favoritedAt` | Active favorite preference and its interaction time, including favorites applied by user-configured rules. |
   | `clickedAmount`, `lastClickedAt` | Click evidence and its latest interaction time, including equivalent rule-applied actions; repeated counts must have bounded influence. |
   | `positiveInd`, `positiveFeedbackAt` | Explicit positive preference and its interaction time. |
   | `negativeInd`, `negativeFeedbackAt` | Explicit negative preference and its interaction time. |
   | `attentionBucket`, `lastMeaningfulReadAt` | Reading-engagement estimate and the latest qualifying meaningful-read time. |

   These columns MUST retain their distinct meanings. A timestamp alone must not substitute for its corresponding active signal. `readAt` and `firstSeen` provide context, not independent positive or negative preference. Missing signals must remain neutral, and missing signal timestamps must follow the defined aging policy rather than being replaced with crawl, calibration, or technical update times. Article content and compatible embeddings supply semantic meaning; they do not supply behavioral preference by themselves.

9. **Events MAY be used only to normalize correlated Article evidence.**
   When multiple interacted Articles belong to the same Event, their combined contribution may be bounded or subject to diminishing returns so repeated coverage of one occurrence does not disproportionately influence an Island.

10. **Event normalization MUST NOT fabricate additional evidence.**
    Interaction with one Article in an Event must not be propagated to the Event’s other Articles or treated as interaction with the Event as a whole.

11. **Multiple genuine interactions within the same Event MAY provide stronger evidence, but MUST NOT scale linearly without bound.**
    Repeated engagement with distinct canonical Articles about the same occurrence may increase confidence or preference strength, while correlation-aware saturation prevents publisher volume from dominating the user profile.

12. **Explicit Article-level feedback MUST retain its normal strength regardless of Event membership.**
    Event normalization MAY limit the additional contribution from repeated coverage, but MUST NOT reduce a single explicit like, dislike, favorite, or equivalent user-configured preference signal merely because its Event contains many Articles. Preserving a signal’s strength does not require unbounded summation of correlated signals.

13. **Island formation MUST remain valid when Events are unavailable or removed.**
    Islands must be learnable and reconstructable from Article-level preference evidence without requiring Event state. Event information may improve evidence normalization but must not define the underlying preference.

14. **Events may identify correlation between behavioral observations, but MUST NOT constitute behavioral observations themselves.**
    Event structure may constrain how repeated evidence is aggregated but must never substitute for actual user interaction or a user-configured preference rule.

15. **Islands MUST support positive and negative weights.**
    Positive evidence can establish or reinforce attraction. Negative evidence can weaken positive preference or establish and reinforce aversion.

16. **Island weights MUST reflect the strength and accumulated support of their evidence.**
    With comparable recency and semantic coherence, many explicit likes must provide stronger positive influence than a few incidental clicks. Weighting may use averaging, saturation, and bounded breadth; each additional positive interaction need not increase the stored weight.

17. **Preference strength, Island confidence, and Article-to-Island relationship confidence MUST remain distinct.**
    Strength describes the signed preference, Island confidence describes its evidential support, and relationship confidence describes its applicability to a candidate Article.

18. **A single weak interaction MUST NOT establish a strong persistent preference.**
    Stronger influence requires sufficient supporting evidence or an explicit high-confidence signal, including a user-configured preference rule. Clicks and reading engagement MUST provide bounded implicit evidence. Repeated observations of the same Article MUST NOT count as independent supporting Articles or become equivalent to explicit approval merely through repetition.

19. **Explicit feedback MUST take precedence over contradictory weak inference in the same interaction context.**
    An explicit dislike must not be neutralized merely by a long dwell time. Later evidence and defined decay may change the resulting preference.

20. **Active Islands MUST expire after a configured inactivity period of 30–90 days.**
    Use one configured inactivity period for all Islands, regardless of signal type or preference sign. The deadline equals the latest qualifying supporting interaction time plus that period; the Island expires when the deadline is reached. Historical strength must not keep an Island active beyond its deadline. Weight may decay before expiry; renewal does not automatically restore previous strength.

21. **Unknown interaction age MUST NOT grant permanent influence.**
    Use a valid interaction timestamp, otherwise publication time as a legacy approximation. If neither is usable, the signal MUST NOT renew or reactivate an Island. Future timestamps MUST NOT extend its deadline. Calibration time and technical update timestamps must not manufacture fresh preference evidence.

22. **Recent evidence MUST be capable of outweighing older evidence.**
    Historical preferences must not permanently dominate the user’s profile.

23. **Each user MUST have at most `MAX_INTEREST_ISLANDS` active Islands after a successful persistence transaction.**
    An Island is active only when it is unarchived and its deadline has not passed. Only active Islands consume capacity; archived and expired Islands do not. New and reactivated preferences must compete for capacity without relaxing semantic eligibility.

24. **Only fresh, qualifying Article-level preference evidence MAY renew an Island.**
    Renewal requires fresh evidence supporting the Island’s resulting signed preference, including direct interactions and newly applied user-configured preference signals. Opposing evidence updates the preference first; it does not automatically renew the existing preference unchanged. Receiving, matching, or scoring Articles—and replaying unchanged evidence—must not renew it. Deadlines derive from interaction time, not processing time. This applies to both positive and negative preferences.

25. **Expired Islands MUST be archived and stop contributing Island-based personalization or consuming active capacity.**
    Identity and explanation history remain available. Expired Islands are inactive even before their archived state is persisted; delayed lifecycle processing must not extend personalization or capacity participation.

26. **Capacity pressure MAY archive weaker Islands before expiry.**
    Existing, new, and reactivated Islands compete in deterministic order: descending current decayed preference magnitude, then descending confidence, then latest qualifying interaction first, then ascending stable Island ID. Strong negative preferences must not be treated as weak because of their sign. New preferences must remain learnable without manual removal of old Islands.

27. **Archived Islands MAY reactivate through fresh qualifying evidence and capacity selection.**
    Reactivation requires a qualifying interaction strictly newer than the expiry or early-archival boundary that ended active participation. Reuse the existing identity when appropriate. Old evidence alone must not reactivate an Island, and renewal, archival, and reactivation decisions must remain explainable.

28. **Island names MUST be unique within a user’s Islands.**
    Uniqueness applies across active and archived Islands belonging to the same user, after trimming leading and trailing whitespace and comparing names case-insensitively. Naming collisions must be resolved deterministically. Renaming must not change preference evidence, weight, or semantic identity.

29. **Equivalent Islands SHOULD be consolidated when their preference evidence can be combined without losing meaningful differences in sign or intent.**
    Vector similarity alone MUST NOT require consolidation, and vectors MUST NOT be artificially moved merely to satisfy a separation threshold.

30. **Consolidation MUST preserve the supporting preference evidence.**
    A higher current weight alone must not justify discarding the other Island’s evidence. Consolidation must not manufacture new interactions or renew expired evidence.

31. **Duplicate records and repeated processing MUST NOT multiply preference evidence.**
    Distinct genuine interactions and newly matched canonical Articles under a user-configured rule may reinforce the same preference. Reprocessing the same Article and unchanged rule outcome must not count as fresh evidence.

32. **Calibration MUST be replay-safe.**
    Reprocessing unchanged evidence must not manufacture additional preference strength, refresh behavioral timestamps, or create duplicate Islands.

33. **Island state and lifecycle decisions MUST be explainable from their supporting evidence.**
    Explanations must identify relevant interactions or user-configured rules and distinguish behavioral changes, decay, capacity decisions, and semantic consolidation. Explanation-retention limits must be explicit.

34. **Island semantics MUST remain user-specific.**
    One user’s interactions, rules, and preferences must not contribute evidence to another user’s Islands.

35. **Unmatched behavioral evidence MAY remain outside Islands.**
    Capacity must never justify a below-threshold semantic match or force unrelated evidence into an existing Island.

36. **Semantic comparisons MUST use compatible embedding models and dimensions.**
    Unknown or incompatible vector spaces must not supply matching, consolidation, or vector-distance evidence.

37. **Derived scores, audit records, and generated labels MUST NOT become new behavioral evidence.**
    Reusing a previous calculation or explanation must not create a feedback loop that strengthens the preference it describes.

38. **Personalization and recommendation scoring MUST support signed results.**
    Positive preferences may increase scores; negative preferences may decrease them. Negative results must not be discarded solely because they are negative.

39. **Recommendation eligibility MUST NOT require an Island match.**
    When no trustworthy personalization evidence exists, interest must be neutral. Every otherwise eligible Article must still receive a finite Recommended score.

40. **Islands MUST NOT determine Event identity or objective content clustering.**
    Personal preferences must not change which Articles describe the same real-world occurrence.

41. **Implementation changes MUST preserve these semantics.**
    Models, thresholds, weighting formulas, decay functions, representations, and algorithms may change without redefining what an Island represents or weakening these boundaries.

## Articles

1. **Publisher content and source metadata MUST remain authoritative source material.**
   AI summaries, labels, embeddings, scores, and semantic relationships must not overwrite or redefine what the publisher supplied.

2. **Original content and derived representations MUST remain distinct.**
   Raw source, sanitized display content, normalized visible text, and publisher descriptions have separate purposes and must not be treated as interchangeable.

3. **Publisher revisions MUST be content corrections only, preserving the existing Article identity.**
   Revisions may update publisher content, source metadata, and the corresponding sanitized representations and content hashes. A revision MUST NOT trigger or enqueue AI enrichment, quality analysis, score recalculation, embedding generation, semantic duplicate detection, Event creation or reassignment, or Island recalibration. Revisions MUST preserve stored analysis scores, embeddings, and semantic assignments; the Article must not re-enter these processes as a newly ingested Article. Normal runtime ranking and independently triggered personalization refreshes remain permitted.

4. **Publisher updates MUST preserve user-owned state.**
   Revisions must not reset reading state, favorites, feedback, clicks, interaction timestamps, or manually assigned tags.

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

18. **Event assignment MUST preserve Article interaction state.**
    Joining an Event must not mark the Article read or inherit another Article’s read state, favorites, feedback, clicks, or engagement.

19. **Articles MUST work independently from Islands.**
    Missing Islands or unmatched personalization must not prevent Article ingestion, storage, presentation, or recommendation eligibility.

20. **An eligible Article MUST be able to influence an Island directly.**
    Its interaction and preference evidence may contribute regardless of Event membership, subject to semantic eligibility and Island capacity.

21. **Articles MUST carry their own interaction and preference state.**
    The authoritative interaction columns are `readAt`, `firstSeen`, `favoriteInd`, `favoritedAt`, `clickedAmount`, `lastClickedAt`, `positiveInd`, `positiveFeedbackAt`, `negativeInd`, `negativeFeedbackAt`, `attentionBucket`, and `lastMeaningfulReadAt`. Islands MUST use this Article-level state according to the evidence meanings defined in Interest Islands rule 8, preserving the distinction between exposure, read state, explicit preferences, and meaningful engagement.

    Clearing or deleting a preference signal MUST remove only that signal’s contribution when personalization is next refreshed. Other active signals on the Article remain valid. Retained audits MUST NOT restore removed evidence.

22. **User-configured preference rules MUST be able to create Article-level preference evidence.**
    A rule-applied favorite or equivalent supported action may influence Islands without requiring a subsequent click or read. Disabling or deleting a preference rule MUST stop future applications. Existing Article-level actions remain until explicitly changed and follow normal decay and expiry; rule removal alone does not reverse them.

23. **Repeated ingestion MUST NOT manufacture fresh behavioral evidence.**
    Re-crawling, revising, re-embedding, or rescoring an Article must not refresh interaction timestamps or repeatedly count an unchanged rule outcome.

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
    Each ranking input MUST have a documented missing-value fallback. Missing analysis MUST remain distinguishable from an observed zero or negative value. Recommended is a ranking score, not a probability. Normal runtime ranking may reflect current source metadata, including a corrected publication date. Independently triggered time-based or behavioral personalization refreshes remain permitted; publisher revisions MUST NOT initiate those refreshes.

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
    Duplicate decisions, semantic relationships, and scoring must have identifiable supporting evidence. Stored analysis and semantic state retained after a content revision refer to the previously analyzed representation and MUST NOT be presented as newly computed from the revised content. Runtime ranking may combine those retained inputs with current metadata and personalization under Article rule 29. This distinction MUST NOT trigger re-enrichment on revision.
