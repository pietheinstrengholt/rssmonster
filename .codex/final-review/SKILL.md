---
name: final-review
description: Perform a rigorous final review of an implementation before considering it ready to merge or ship. Use after implementation is substantially complete to find remaining correctness, security, architecture, maintainability, regression, and testing issues. Focus on real defects and material risks, not optional enhancements or speculative nice-to-haves.
---

# Final Review

## Purpose

Perform a rigorous final review of the completed implementation before it is considered ready to merge or ship.

Review the implementation as a connected system rather than as isolated files.

The goal is to identify:

- correctness bugs
- regressions
- security issues
- architectural inconsistencies
- incomplete error handling
- concurrency or lifecycle problems
- data integrity risks
- API or contract mismatches
- insufficient or misleading tests
- maintainability issues that materially increase defect risk

Do not expand the scope into unrelated improvements, redesigns, or nice-to-have enhancements.

This is a review skill, not an implementation skill. Do not modify code unless explicitly asked to fix the findings.

## Review principles

### Review the requested design

Use the original request, agreed design, acceptance criteria, and implementation decisions as the baseline.

Do not introduce new requirements during the review.

Distinguish clearly between:

- actual bugs
- violations of the requested design
- material engineering risks
- acceptable trade-offs
- optional future improvements

Optional improvements must not prevent a `GOOD TO GO` conclusion.

### Inspect the whole implementation

Do not review only the most recently edited file.

Inspect where relevant:

- complete working-tree diff
- changed files
- direct callers and callees
- models
- migrations
- controllers
- routes
- services
- background workers
- API contracts
- frontend stores
- Vue components
- configuration
- tests
- documentation
- existing repository conventions
- relevant `AGENTS.md` files

Trace the changed behavior end to end.

### Prefer evidence over assumptions

Do not report speculative findings.

Before reporting an issue:

1. trace the actual execution path;
2. inspect relevant surrounding code;
3. determine whether another layer already handles the concern;
4. inspect existing tests where appropriate;
5. verify that the issue can actually occur.

If something cannot be established from the repository, state the uncertainty instead of presenting it as a defect.

## Review procedure

### 1. Establish scope

Determine:

- what was requested;
- what behavior changed;
- which design decisions were explicitly agreed;
- which files and subsystems are involved;
- what should remain unchanged.

Summarize the intended behavior internally before evaluating the implementation.

### 2. Review the implementation diff

Inspect the complete relevant diff.

Look for:

- accidental unrelated changes
- duplicated logic
- stale code paths
- missing cleanup
- partially replaced implementations
- inconsistent naming or semantics
- comments that no longer match behavior
- configuration changes that are not propagated consistently

### 3. Trace runtime behavior

Follow the main runtime paths affected by the change.

For backend changes, trace where relevant:

request / job / worker
→ validation
→ controller or service
→ model/query
→ persistence
→ response or downstream processing

For frontend changes, trace where relevant:

user interaction
→ component
→ store/composable
→ API
→ state update
→ rendered result

For background processing, trace where relevant:

job creation
→ claiming
→ execution
→ retries
→ failure handling
→ completion
→ side effects

Check both successful and failure paths.

### 4. Review correctness

Look specifically for:

- incorrect conditions
- incorrect defaults
- invalid assumptions
- boundary errors
- stale state
- unexpected null or undefined handling
- missing validation
- incorrect query semantics
- wrong user scoping
- inconsistent identities
- incorrect ordering
- pagination errors
- state transitions that can become impossible
- behavior that differs between create/update/retry paths
- incorrect interaction with existing features

### 5. Review data integrity

Where persistence is involved, verify:

- ownership and user isolation
- foreign-key semantics
- uniqueness assumptions
- transaction boundaries
- idempotency
- deduplication behavior
- retry safety
- partial-failure behavior
- migration/runtime compatibility
- safe handling of existing rows
- delete/update lifecycle behavior

Pay particular attention to code that can silently corrupt or duplicate data.

### 6. Review concurrency and lifecycle behavior

Where applicable, check:

- races
- double execution
- duplicate jobs
- lost updates
- stale locks or leases
- process restarts
- retries
- crashes between state transitions
- timeout handling
- cancellation
- shutdown behavior

Do not flag theoretical concurrency concerns unless the affected code can realistically execute concurrently.

### 7. Review security

Inspect relevant attack surfaces, including:

- authentication
- authorization
- user isolation
- input validation
- SQL/query safety
- HTML rendering
- SSRF
- redirects
- URL handling
- secrets
- filesystem access
- command execution
- logging of sensitive values

Only report security findings that are applicable to the changed code or materially affected by it.

### 8. Review API and contract consistency

Check interfaces between components.

Verify where relevant:

- request and response shapes
- nullable fields
- enum values
- status codes
- error semantics
- model serialization
- frontend expectations
- worker payloads
- environment variables
- defaults
- backwards compatibility

Look for places where both sides compile or run independently but disagree semantically.

### 9. Review tests

Inspect existing and newly added tests.

Determine whether they test behavior rather than implementation details.

Look for missing coverage of material scenarios such as:

- normal success
- relevant edge cases
- failure paths
- regression scenarios
- retries or duplicate execution
- authorization/user scoping
- existing-data compatibility

Run the relevant tests when possible.

Do not demand exhaustive testing for trivial branches.

### 10. Run appropriate validation

Use the repository's existing validation mechanisms where available.

Examples:

- targeted tests
- broader relevant test suites
- linting
- type checks
- builds
- migration validation
- focused runtime checks

Do not invent new validation requirements unrelated to the change.

### 11. Re-check findings

Before producing the final review, revisit every proposed blocking or should-fix finding.

For each finding confirm:

- the relevant code path exists;
- the issue is not handled elsewhere;
- it conflicts with intended behavior or creates material risk;
- fixing it would not merely be an optional redesign.

Remove weak or speculative findings.

## Severity

Use only these categories.

### Blocking

A real issue that makes the implementation unsafe to merge or ship.

Examples:

- data corruption
- serious security vulnerability
- broken primary functionality
- major regression
- incompatible migration
- reliably crashing runtime path
- violation of a critical requested requirement

### Should fix

A concrete defect or material engineering risk that should be corrected before considering the work complete.

Examples:

- meaningful edge-case failure
- missing error handling on a realistic path
- incorrect lifecycle behavior
- contract inconsistency
- important regression risk without adequate test coverage

### Acceptable trade-off

Something that is imperfect but reasonable within the requested design.

This does not block completion.

### Future improvement

A useful enhancement that is outside the requested scope.

Keep this section short.

Do not turn future improvements into another implementation backlog.

## Required output

Return the review using this structure:

# Final Review

## Verdict

**GOOD TO GO**

or

**NOT GOOD TO GO**

Add a concise explanation.

## Blocking

List only confirmed blocking findings.

For each finding include:

- affected file or subsystem
- problem
- why it matters
- concrete evidence
- required correction

If none:

`None.`

## Should fix

List only concrete issues that should still be addressed.

Use the same evidence-based format.

If none:

`None.`

## Acceptable trade-offs

Briefly list noteworthy decisions that are reasonable as implemented.

If none:

`None.`

## Future improvements

Include only clearly optional improvements that are worth preserving for later.

Do not include speculative or low-value ideas.

If none:

`None.`

## Validation

Summarize:

- code paths inspected
- tests executed
- build/lint/type checks executed
- relevant tests that already cover the behavior
- anything that could not be validated

## Final assessment

Explicitly answer:

1. Does the implementation satisfy the requested design?
2. Are there remaining correctness or regression risks?
3. Are tests sufficient for the material behavior changed?
4. Is there anything that must be fixed before merge?
5. Is the implementation ready to merge or ship?

End with exactly one of:

**Final verdict: GOOD TO GO**

or

**Final verdict: NOT GOOD TO GO**