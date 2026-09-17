# CRAWL SYSTEM INVARIANTS

Feeds define what RSSMonster attempts to retrieve. Crawl runs execute that work. Crawl results record what happened. Accepted feed items may create or update Articles.

Crawling must be safe to retry, bounded in resource usage, isolated between users, and must preserve publisher identity and user intent.

## Terminology

- **Crawl run:** A user-scoped execution that coordinates processing of eligible Feeds.
- **Feed execution:** Processing one Feed within a crawl run, including acquisition, parsing, item processing, and recording its outcome.
- **Acquisition attempt:** An individual retrieval attempt within a Feed execution. A Feed execution may include bounded retries or endpoint recovery.
- **Feed result:** The recorded final outcome of a Feed execution, including available acquisition diagnostics and item-processing counts.
- **User-configured automation:** Explicit rules configured by the owning user that apply supported changes to Articles.
- **Unchanged retrieval:** A `304 Not Modified` response or a representation matching previously accepted content. This is distinct from a changed representation that produces no new Articles.

## Feed Crawling

1. **Every Feed execution MUST operate on an identifiable Feed.**
   Retrieval, results, errors, redirects, and accepted Articles must remain attributable to the originating Feed or its reconciled canonical successor.

2. **Every Feed MUST belong to exactly one user.**
   Crawling, Article creation, statistics, aliases, errors, and crawl state must preserve the user boundary.

3. **A Feed MUST be processable independently from other Feeds.**
   Failure, malformed content, slowness, or unusual behavior from one Feed must not invalidate successfully processed work for other Feeds or indefinitely prevent their processing.

4. **Repeated crawling MUST be safe.**
   Crawling unchanged content must not manufacture new Articles, repeat committed interaction effects, or multiply semantic evidence.

5. **A successful crawl MUST NOT imply that new Articles were discovered.**
   Unchanged retrieval, existing items, filtered items, and duplicate items may all produce a successful execution with no new visible Articles.

6. **A crawl failure MUST NOT invalidate previously accepted content.**
   Failure may update operational health and diagnostics, but must not remove or corrupt previously stored Articles or useful source data.

7. **Missing content in a later crawl MUST NOT imply deletion.**
   Items disappearing from a Feed must not automatically delete existing Articles.

8. **Crawler behavior MUST be bounded.**
   Requests, redirects, response sizes, parsing work, entry counts, retry attempts, concurrency, and processing time must have explicit limits. Nested work must respect the Feed execution's remaining deadline rather than repeatedly starting fresh time budgets.

9. **One problematic Feed MUST NOT monopolize crawl capacity indefinitely.**
   Persistent failures, excessive latency, redirect loops, and malformed responses must terminate within defined bounds. Request coordination must also respect configured per-origin limits.

10. **Crawl scheduling MUST NOT create uncontrolled overlapping work for the same Feed.**
    Scheduled and manually triggered work must respect shared coordination. Persisted scheduling state determines eligibility; claims, leases, or equivalent safeguards control execution.

## Retrieval

11. **Crawler retrieval MUST treat remote content as untrusted input.**
    Feed responses, redirects, headers, markup, URLs, and metadata must be validated before use.

12. **HTTP redirects MUST be bounded and traceable.**
    Redirect loops or excessive redirect chains must terminate safely. Redirect targets remain subject to the same security and execution limits as the initial request.

13. **Feed URL promotion MUST require accepted endpoint evidence.**
    Redirects, discovery, and publisher-declared URLs must not automatically establish canonical ownership. Promotion must preserve useful historical URLs and resolve same-user endpoint conflicts safely.

14. **Known historical Feed URLs MAY remain aliases of the canonical Feed.**
    Aliases are user-scoped. A normalized alias must not identify multiple independent Feeds for the same user. Same-user convergence must preserve Articles, user state, settings, and useful history; Feeds belonging to different users must not be merged.

15. **Conditional retrieval state MUST refer to previously accepted representations.**
    ETags, modification validators, and unchanged-content hashes must not become authoritative solely because retrieval returned HTTP success. Invalid or rejected content must not establish accepted retrieval state.

16. **A valid `304 Not Modified` response MUST be treated as successful unchanged retrieval.**
    It must not fabricate Article updates or refresh source-derived Article state. Matching previously accepted content may likewise skip parsing and item processing. Unchanged retrieval must not be interpreted as proof that earlier failed item processing succeeded.

17. **HTTP success alone MUST NOT establish successful Feed processing.**
    Retrieval, parsing, item acceptance, persistence, and optional downstream processing are separate stages with distinct outcomes.

18. **Unsupported or invalid content MUST fail safely.**
    HTML error pages, authentication pages, malformed XML, oversized responses, and unrelated content must not silently become feed items. Explicitly configured HTML extraction sources must follow their own validation and extraction contract.

19. **Crawler network access MUST obey security boundaries.**
    User-supplied URLs, redirects, discovery targets, and publisher-declared endpoints must not permit unintended access to prohibited local, private, or protected resources.

## Feed Parsing

20. **Supported source formats MUST normalize into a common item representation before Article persistence.**
    RSS, Atom, JSON Feed, and configured extraction sources must supply the established downstream contracts.

21. **Format-specific parsing MUST preserve downstream Article identity semantics.**
    Adapters must preserve meaningful identifiers and their provenance rather than introducing format-dependent identity rules.

22. **Parser tolerance MUST NOT silently fabricate publisher information.**
    Missing fields may use explicitly defined fallbacks, but fallback values must not masquerade as publisher-supplied metadata.

23. **Malformed individual items SHOULD be isolated when safely possible.**
    Valid items may be retained when invalid items can be separated without accepting a structurally invalid or unsafe Feed.

24. **One malformed item MUST NOT corrupt another item.**
    Item processing must preserve independent identity, content, diagnostics, and persistence boundaries.

25. **Item order in the Feed MUST NOT determine Article identity.**
    Reordering items between crawls must not create new Articles for already resolved publisher entries.

26. **Feed truncation MUST NOT imply that omitted historical items ceased to exist.**
    A Feed represents the items currently supplied by its source, not an authoritative deletion list.

27. **Publication, modification, and crawl timestamps MUST retain distinct meanings.**
    Publisher timestamps and inferred fallbacks must follow the established Article timestamp rules. Crawl time must not silently replace known publisher time.

## Article Ingestion

28. **Every item considered for Article creation MUST pass through Article identity resolution first.**
    Deterministic publisher identity takes precedence over content similarity.

29. **An item resolving to an existing Article MUST be reconciled with that Article rather than recreated.**
    Reconciliation may update permitted fields or leave the Article unchanged.

30. **Article creation MUST be idempotent.**
    Retries and concurrent processing of the same resolved publisher item must not create multiple canonical Articles.

31. **Crawling MUST distinguish ingestion from user-configured automation.**
    Retrieval, parsing, rediscovery, and enrichment must not by themselves infer user interactions. Explicit user-configured automation MAY modify supported Article fields, including tags, scores, status, favorite state, click-related state, and filtering state, according to each action's defined semantics.

    Automation must remain user-scoped and replay-safe. Repeated crawling must not accumulate duplicate tags, repeat committed click-related effects, or refresh interaction timestamps merely because an item was encountered again. Rule-driven state changes must not be interpreted as evidence of reading activity beyond what the action explicitly represents.

32. **Publisher reconciliation MUST preserve existing user-owned Article state.**
    Source updates must not overwrite read status, favorites, clicks, interaction timestamps, manual tags, or other user-owned state merely because publisher content changed.

    User-configured automation may change fields it explicitly governs according to the applicable action lifecycle. In the current revision design, crawl-owned tags, filtering, and rule-controlled scores may be reconciled, while existing engagement fields and manual tags remain protected.

33. **Publisher revisions MAY update source-owned Article fields.**
    Updates must follow Article identity, source-authority, field-retention, and revision-classification rules.

34. **Sparse publisher updates MUST NOT erase useful stored content without explicit field-specific rules.**
    Missing or empty incoming values must not automatically replace meaningful stored source data.

35. **Duplicate detection MUST remain distinct from Feed parsing and publisher identity resolution.**
    Parsing establishes candidate items. Identity resolution finds existing publisher entries. Duplicate detection determines whether separate candidates represent already accepted content.

36. **Suppressed duplicates MUST NOT independently multiply downstream evidence.**
    Encountering duplicate content must not create additional canonical Articles, interaction effects, or independent semantic support for the same accepted content.

## Crawl Results and State

37. **Every completed Feed execution MUST have an observable final outcome.**
    Final status, acquisition diagnostics, and processing counts must together distinguish relevant success and failure conditions. A successful recovery may include failed acquisition attempts. Item-processing failures must remain observable rather than being represented as complete item-processing success.

38. **Current crawl state MUST NOT rewrite historical outcomes.**
    Updating scheduling, health, or retry state must not retroactively change what an earlier execution recorded.

39. **Feed recovery MUST NOT erase retained failure history.**
    Clearing current error state is distinct from deleting historical diagnostics. History retention and explicit deletion policies may bound what remains available.

40. **Failure information MUST identify the failing stage where known.**
    Retrieval, HTTP handling, parsing, validation, item processing, persistence, and optional downstream failures must not be conflated when the distinction is available.

41. **Crawl statistics MUST derive from recorded processing facts where available.**
    Historical crawl results must not be reconstructed solely from current Article counts, which can change independently of crawling.

42. **Operational timestamps MUST remain semantically distinct.**
    Last attempt, last successful acquisition, last accepted representation change, and execution completion must not silently substitute for one another. A changed representation does not necessarily imply a new or revised Article.

43. **Successful unchanged retrieval MUST be capable of restoring acquisition health.**
    It may clear acquisition failure state without pretending that new content was discovered or unrelated processing failures were resolved.

44. **Retries and recovery MUST preserve the meaning of preceding failures.**
    A Feed execution may record one final result with bounded diagnostics for its acquisition attempts. Later successful executions must not retroactively replace earlier recorded failures.

## Failures and Retries

45. **Failures MUST be classified according to available evidence.**
    Transient, rate-limited, malformed, security-related, permanent, and configuration-related failures should remain distinguishable where supported. Classification must not imply certainty the system does not possess.

46. **Immediate retries MUST be bounded, and future retries MUST follow scheduling policy.**
    Each execution has finite retry and recovery limits. Later scheduled attempts may continue with appropriate backoff rather than a fixed lifetime attempt limit. Scheduling must respect configured publisher freshness and `Retry-After` bounds, failure classification, quarantine, and disabled automatic fetching.

47. **Retrying MUST be idempotent.**
    A retry must not duplicate Articles or repeat downstream side effects already committed by an earlier attempt.

48. **Partial failure MUST preserve successfully committed independent work.**
    A failed item or later stage must not require discarding independent committed Articles unless the applicable transaction explicitly requires atomic rollback.

49. **Failure recovery MUST NOT depend solely on process memory.**
    Restarting RSSMonster must not leave persisted Feed state, crawl state, or committed work inconsistent or permanently unrecoverable.

50. **Crash recovery MAY terminate stale or abandoned executions with an explicit failure diagnostic.**
    Recovery must not claim successful completion, invent item outcomes, or infer that unobserved work committed. A recovery timestamp records when abandonment was detected, not a known source-processing completion time.

## Concurrency and Persistence

51. **Concurrent crawling MUST preserve Article identity guarantees.**
    Parallel workers must not create duplicate canonical Articles from the same resolved item. Race recovery must identify the actual persisted winner using established identity constraints.

52. **Concurrent Feed processing MUST preserve user isolation.**
    Identity lookup, duplicate matching, actions, tags, aliases, results, and downstream scheduling must remain scoped to the owning user.

53. **Persistence MUST NOT present partially committed work as complete success.**
    Article changes and related state must respect their transaction boundaries. Acquisition success, committed item work, and item-processing failures must retain their separate meanings.

54. **Coordination state MUST have explicit ownership, expiry, and lifecycle semantics.**
    Locks, claims, leases, or equivalent mechanisms must become recoverable after crashed or abandoned work. Active work must maintain ownership for the period in which it may commit changes.

55. **A worker that loses ownership MUST NOT commit further crawl-owned mutations.**
    An expired or superseded worker must not overwrite Article or Feed state, publish a terminal result as the current owner, or release another worker's claim. Recovery must preserve already committed work without duplicating its effects.

56. **Correctness guarantees MUST hold at every supported concurrency level.**
    Sequential and bounded parallel execution may differ in timing and processing order, but must preserve identity, ownership, transaction, and replay guarantees.

57. **Supported database dialects MUST preserve equivalent correctness guarantees.**
    MySQL and SQLite may use different execution strategies, but must preserve the applicable ownership, identity, coordination, and persistence semantics.

## Downstream Processing

58. **Successful Article persistence MUST be separable from optional downstream processing.**
    Failure of embeddings, summaries, quality scoring, Event processing, Island processing, or other optional work must not remove a successfully ingested Article.

59. **Crawling MUST NOT require semantic processing to succeed.**
    Unavailable or failed semantic services must not invalidate independently accepted source content.

60. **Downstream work MUST operate on persisted canonical Article identity.**
    Optional processors must not rely solely on transient parser objects or crawler memory to identify their target.

61. **Downstream processing MUST NOT be counted as another source retrieval or user interaction.**
    Analysis, derived-state refreshes, and job retries are processing activity, not additional crawl or behavioral evidence.

62. **Repeated downstream processing MUST be replay-safe.**
    Reprocessing may update derived state, but must not create duplicate Article identity, duplicate behavioral effects, or repeated independent support from the same evidence.

63. **Optional processing SHOULD be recoverable independently from source recrawling.**
    Already persisted source content should support retries without another download solely to reconstruct that content.

## Security and Isolation

64. **Feed-provided content MUST NOT be trusted as application instructions.**
    Publisher text, markup, and metadata must not gain authority over application configuration, user actions, or privileged processing.

65. **Feed markup MUST be sanitized before presentation according to Article-content rules.**
    Raw source preservation and safe rendered derivatives are distinct contracts. Retaining original content does not authorize rendering it unsanitized.

66. **Feed-controlled URLs MUST pass applicable security checks before server-side retrieval.**
    Validation must cover redirects and nested acquisition paths as well as the initial Feed URL.

67. **Crawler diagnostics MUST NOT expose secrets or unnecessary private infrastructure details.**
    Credentials, authentication headers, tokens, sensitive URL components, and internal transport diagnostics must be redacted or excluded from exposed results and logs. Crawler-added secrets must not enter stored publisher content.

68. **One user's Feed configuration MUST NOT expose another user's data.**
    Feed URLs, Articles, aliases, crawl history, errors, and automation rules must retain their ownership boundaries through direct and indirect access paths.

## Observability

69. **The system MUST make relevant crawl decisions explainable.**
    Available state and diagnostics must distinguish attempted processing from scheduling deferral, disabled automatic fetching, quarantine, or ownership conflicts where those reasons are known.

70. **The system MUST distinguish no new content from failure.**
    Unchanged retrieval, changed content containing only known or filtered items, and failed processing must not be treated as interchangeable outcomes.

71. **Accepted Articles MUST retain Feed provenance.**
    Where retained crawl records provide sufficient correlation, the system should also make it possible to identify the execution that created or updated an Article. Missing correlation must not be replaced with an invented attribution.

72. **Operational observability MUST NOT become publisher or behavioral evidence.**
    Logs, statistics, traces, and health monitoring may support scheduling and recovery, but must not manufacture Article identity, publisher revisions, or user interactions.

73. **Implementation changes MUST preserve these crawl guarantees.**
    HTTP libraries, parsers, queue mechanisms, retry strategies, concurrency implementations, database dialects, scheduling algorithms, and deployment topology may change without weakening the applicable identity, ownership, safety, persistence, and replay semantics.