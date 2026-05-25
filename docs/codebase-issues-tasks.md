# Codebase Review: Proposed Fix Tasks

This document captures four concrete follow-up tasks discovered during a targeted codebase review.

## 1) Typo fix

- **Task:** Fix the typo `seperated` -> `separated` in a Fever controller comment.
- **File:** `server/controllers/fever.js`
- **Location:** Comment describing comma-separated feed IDs.

## 2) Bug fix

- **Task:** Enforce category ownership checks by user for read/update/delete handlers.
- **File:** `server/controllers/category.js`
- **Issue summary:** Several handlers use `findByPk` without robust ownership constraints, which can allow cross-user access/mutation if IDs are guessed.
- **Suggested fix:** Use user-scoped lookups (e.g., `findOne({ where: { id: categoryId, userId } })`) before update/delete.

## 3) Documentation discrepancy fix

- **Task:** Reconcile API status code docs with actual endpoint behavior.
- **Files:**
  - `docs/api.md`
  - `server/controllers/category.js`
- **Issue summary:** Docs state `204` for deletions/updates, but `updateCategory` returns `200` with a response body.
- **Suggested fix:** Either update docs to reflect mixed behavior, or normalize controller status codes.

## 4) Test improvement

- **Task:** Add regression tests for category ownership authorization.
- **Target folder:** `server/tests/`
- **Coverage to add:**
  - GET category by ID rejects foreign-user category
  - PUT category by ID rejects foreign-user category
  - DELETE category by ID rejects foreign-user category

