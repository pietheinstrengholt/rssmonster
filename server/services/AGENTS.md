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