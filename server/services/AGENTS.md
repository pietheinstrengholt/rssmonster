# AGENTS.md

## Scope

Applies to `server/services/`.

Follow the root `AGENTS.md` and `server/AGENTS.md` first.

Before modifying a service, read the nearest relevant `README.md` file. The README files describe the subsystem architecture, invariants, terminology, and expected behavior. Treat them as required context, not optional documentation.

## Working Rules

* Inspect the service, callers, related models/helpers, tests, and relevant README before editing.
* Preserve existing service contracts and domain boundaries.
* Reuse existing services/helpers instead of duplicating logic in controllers, workers, or scripts.
* Keep HTTP-specific behavior in controllers; keep reusable domain logic in services.
* Preserve transaction and side-effect boundaries.
* Keep all user-owned processing scoped to the correct `userId`.
* Do not introduce hidden process-local state.

## Semantic and Expensive Work

* Apply deterministic eligibility rules before probabilistic scoring.
* Use bounded candidate sets.
* Reuse existing vector/similarity helpers.
* Keep thresholds in existing configuration.
* Zero matches is a valid result.
* Avoid per-item database queries, repeated vector normalization, and unnecessary full-table scans.

## Persistence

Respect the source-of-truth relationships documented in the relevant README.

Do not update denormalized convenience fields without preserving their authoritative relationship state.

Preserve persistent semantic identities where the subsystem contract expects gradual evolution rather than recreation.

## Testing

Add focused regression tests for changed behavior.

Prioritize domain invariants, user isolation, persistence consistency, boundary cases, and deterministic outcomes.

## Final Standard

`read the README · preserve boundaries · reuse existing logic · scope by user · bound expensive work`

When code and assumptions conflict with the documented subsystem contract, investigate before changing behavior.

## Event, Topic, and recommendation invariants

* Event identity is occurrence-based; preserve the shared membership policy, whole-Event temporal span checks, ambiguity, and neutral missing feature evidence.
* Topic identity is durable-subject continuity. Do not copy Event version/action conflicts into Topic rejection rules; preserve subject checks and ambiguity handling.
* Respect EventTopic/ArticleTopic and IslandTopic confidence downstream. Weak fallback must not silently become a strong primary relationship.
* Generated labels are presentation/explanation metadata, not independent semantic or ranking evidence unless explicitly designed and tested as such.
* Do not repair Recommended coverage by lowering similarity thresholds, raising community capacity, or forcing unmatched behavioral profiles into Islands.
* No trustworthy interest path means `interestScore = 0`; every otherwise eligible Article still receives Recommended.
* Keep preference strength, Island confidence and relationship confidence separate. Preserve singleton attenuation, intent-aware explicit fallback, and bounded path deduplication.
* Preserve signed explicit feedback. Unread, no click, and missing engagement must not become implicit dislikes.
* Preserve replay-safe behavioral snapshots; audit history and derived scores are not new behavioral evidence.
* Do not retune final Recommended weights while changing semantic evidence unless explicitly requested.
* Test held-out Articles that did not participate in Island formation. Seed self-similarity is not evidence of generalization.
* For every semantic-processing change, run `npm run test:semantic-trace` from `server/` before implementation and after the final change. Follow the [required capture/comparison workflow](../tests/semantic/README.md#required-beforeafter-workflow-for-semantic-changes), preserve both reports, and explain metric and article-level differences in the final response. Inspect diagnostics, not only pass/fail; run relevant gold tests too. Never hardcode Event/Topic IDs or weaken expectations to make the suite green.

Authoritative references: [Events](events/README.md), [Topics](topics/README.md),
[Islands and interest formulas](islands/README.md),
[Recommended formula](../../docs/scoring.md), and
[regression testing](../tests/semantic/README.md).
