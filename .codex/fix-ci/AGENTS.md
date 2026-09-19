---
name: fix-ci
description: Diagnose and fix failing GitHub Actions CI tests after a commit or pull request.
---

# Fix CI

Use this skill when GitHub Actions CI fails after a commit or pull request.

## Goal

Find the actual cause of the CI failure and apply the smallest correct fix.

Do not blindly update tests just to make CI green.

## Workflow

1. Inspect the failing GitHub Actions workflow/run.
2. Read the failed job and relevant log output.
3. Identify the first meaningful error or failed assertion.
4. Locate the failing test and the production code it exercises.
5. Reproduce the failure locally with the smallest possible test command.
6. Determine whether the failure is caused by:
   - a real application regression;
   - an intentionally changed application behavior with an outdated test;
   - test brittleness;
   - environment/configuration differences;
   - flaky timing/concurrency behavior;
   - dependency or infrastructure failure.
7. Apply the smallest appropriate fix.
8. Run the failing test again.
9. Run the surrounding test file or test suite.
10. Run broader relevant tests when the change could affect other behavior.
11. Report:
    - failing CI job;
    - failing test(s);
    - root cause;
    - files changed;
    - tests run;
    - final result.

## Rules

- Never modify a test solely because its expected value differs from the implementation.
- Understand the intended behavior first.
- Prefer fixing production code when behavior has unintentionally regressed.
- Update tests when application behavior intentionally changed but the test still represents the old contract.
- Prefer behavior-based assertions over implementation-detail assertions.
- Preserve existing comments.
- Do not weaken assertions merely to make tests pass.
- Do not skip, disable, `.only`, `.todo`, or remove failing tests.
- Do not increase arbitrary timeouts unless timing is genuinely part of the problem.
- Do not regenerate snapshots without reviewing the semantic difference.
- Do not make unrelated refactors.
- Keep fixes narrowly scoped.

## RSSMonster conventions

RSSMonster uses:

- Express 5
- Vue 3
- Vitest
- Sequelize
- ESM JavaScript

Follow existing project patterns.

Use ESM imports only.

For server models use the existing model factory:

```js
import db from '../models/index.js';

const { Article, Feed } = db;