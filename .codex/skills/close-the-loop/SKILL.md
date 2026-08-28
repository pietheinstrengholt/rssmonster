---
name: close-the-loop
description: Use this skill when a feature has already gone through multiple implementation and review cycles and the work is starting to loop. The objective is to close the implementation cycle without turning every review observation into additional scope.
---

# Close the Loop

## Purpose

Use this skill when a feature has already gone through multiple implementation and review cycles and the work is starting to loop.

The objective is to close the implementation cycle without turning every review observation into additional scope.

This skill should:

1. reconstruct the agreed feature contract;
2. identify remaining genuine defects;
3. fix only issues required by that contract;
4. avoid nice-to-haves and speculative improvements;
5. run relevant validation;
6. perform one final read-only acceptance review;
7. give a clear final go/no-go decision.

## When to use

Use this skill when the user asks things such as:

- "close the loop"
- "finish this feature"
- "one more review"
- "fix the remaining issues and tell me if we're done"
- "Codex is going in circles"
- "stop finding new nice-to-haves"
- "fix only the real remaining bugs"
- "are we ready to merge?"
- "perform a final acceptance review"

It is especially relevant when multiple previous review/fix iterations have already happened.

Do not use this workflow for the first implementation or first substantive design review of a feature.

## Core principle

Judge the implementation against the agreed requirements, not against every possible improvement.

A better, more scalable, more observable, more defensive, or cleaner implementation being possible does not make the current implementation defective.

It is valid and preferred to conclude that no defects remain.

Do not manufacture findings merely because a review was requested.

## Step 1 — Reconstruct the agreed contract

Review the current conversation, requested feature, previous design decisions, accepted trade-offs, existing code, and relevant documentation.

Create a concise acceptance contract from:

- functionality explicitly requested by the user;
- design decisions explicitly agreed with the user;
- bugs/findings the user explicitly requested to fix;
- existing behavior that must remain intact;
- documented API/runtime contracts affected by the feature.

Do not silently introduce new requirements.

Do not reopen previously accepted decisions just because another design is possible.

## Step 2 — Triage remaining findings

Classify each remaining finding as:

### Must fix

A concrete violation of:

- the agreed feature design;
- explicit requested behavior;
- an existing relied-upon contract;
- security;
- data integrity;
- correctness;
- lifecycle/resource accounting;
- deployment/startup behavior;
- or another clear production invariant.

### Non-blocking defect

A real correctness issue that does not prevent the feature from being safely shipped.

### Hardening

A useful defensive or robustness improvement without a current contract violation.

### Nice-to-have

Examples:

- additional metadata;
- more logging or observability;
- cleaner abstractions;
- extra configuration;
- broader use-case support;
- speculative edge-case protection;
- unrelated performance optimization;
- stylistic consistency;
- architectural improvements with no concrete current failure.

### Future work / accepted limitation

A deliberate trade-off or capability outside the agreed feature scope.

## Defect test

Before classifying anything as a defect, answer:

1. What exact agreed requirement or invariant does this violate?
2. What concrete production failure can result?
3. Is the issue caused by or materially affected by the current feature?

If questions 1 and 2 cannot be answered clearly, do not classify it as a defect.

Put it under Hardening, Nice-to-have, or Future work instead.

## Step 3 — Fix only required issues

Implement only Must fix findings.

A very small adjacent non-blocking defect may be fixed if it is directly caused by the same change and fixing it clearly reduces risk.

Do not:

- redesign working components;
- refactor unrelated code;
- broaden feature scope;
- add unrelated capabilities;
- implement speculative hardening;
- implement backlog items;
- reopen accepted design decisions.

Prefer the smallest robust change consistent with the existing architecture and project conventions.

Preserve existing comments.

Preserve existing successful public behavior unless the agreed contract explicitly changes it.

## Step 4 — Add regression coverage

For every Must fix issue:

- identify the concrete failure scenario;
- add or update a test that would have failed before the fix;
- verify the intended behavior after the fix.

Avoid speculative test expansion unrelated to the fixes.

## Step 5 — Validate

Run relevant project validation.

Depending on the affected area, this may include:

- focused regression tests;
- full affected test suite;
- lint;
- type checking;
- build;
- configuration validation;
- syntax checks;
- `git diff --check`.

Inspect:

- `git diff`;
- `git status`.

Confirm the fix did not accidentally expand scope.

If an unrelated or flaky test fails, investigate whether it is caused by the current feature before treating it as a blocker.

## Step 6 — Final acceptance review

After fixes and validation, perform exactly one final read-only acceptance review.

Do not modify files during this review.

Review against the acceptance contract established in Step 1.

This is not an open-ended code audit.

Do not search for additional architecture improvements.

Do not reopen accepted design choices.

For any new observation, apply the Defect test above.

It is valid to report zero remaining defects.

## Severity

Use:

- P0 — catastrophic security or data corruption.
- P1 — merge blocker: serious security exposure, data loss, crash, deadlock, broken startup/deployment, major lifecycle/resource failure, or failure of the core agreed feature.
- P2 — concrete non-blocking runtime correctness issue.
- P3 — genuine minor correctness issue.
- Hardening — useful improvement without current contract violation.
- Future work — accepted limitation or deliberately deferred capability.

Do not promote an issue to P1/P2 merely because a more robust implementation is possible.

## Stopping rules

P2, P3, Hardening, Nice-to-have, and Future work findings do not automatically trigger another implementation/review cycle.

Only P0/P1 or a failed core acceptance criterion should keep the feature open.

Once the final decision is:

GOOD TO GO — FEATURE CLOSED

the feature is considered complete.

Do not recommend another broad review.

Move remaining non-blocking items to backlog instead.

## Required final report

Return these sections:

### 1. Agreed acceptance criteria

For each criterion:

- PASS
- FAIL
- NOT PROVEN

### 2. Fixes completed

For each issue fixed:

- problem;
- violated requirement;
- fix;
- regression test;
- result.

If none were required, say so.

### 3. Blocking findings

Only P0/P1.

If none:

None.

### 4. Non-blocking findings

Only P2/P3.

### 5. Hardening / nice-to-haves

Keep concise.

Do not implement them during the final review.

### 6. Accepted limitations / future work

List explicitly deferred items.

### 7. Validation

Report exact test, lint, build, configuration, and diff-check results.

### 8. Final decision

Use exactly one of:

GOOD TO GO — FEATURE CLOSED

or

NOT READY — BLOCKING DEFECT REMAINS

NOT READY requires a concrete P0/P1 defect or failed core acceptance criterion.

P2/P3, hardening, alternative architectures, additional observability, style improvements, and accepted limitations must not independently result in NOT READY.

If the result is GOOD TO GO — FEATURE CLOSED, do not recommend another broad review.