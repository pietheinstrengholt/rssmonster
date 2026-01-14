# RSSMonster Constitution
<!-- Spec-Kit Constitution for RSSMonster -->

## Core Principles

### I. Architecture Fidelity (NON-NEGOTIABLE)
RSSMonster code **MUST strictly conform** to the existing architecture.

- Backend is **Express using ESM only**
- Frontend is **Vue**, following existing project conventions
- Frontend uses **Bootstrap 5** for styling and layout
- ORM is **Sequelize with factory-style models**
- All models are initialized exclusively via `models/index.js`
- All controllers, utilities, background scripts, and services **must import models from `models/index.js`**
- No alternative initialization paths, no global state, no architectural shortcuts

Deviation from established architecture is a constitutional violation.

---

### II. Explicit Initialization & Dependency Injection
Nothing in RSSMonster is implicit.

- Caches, background jobs, schedulers, queues, and services must be **explicitly initialized per entrypoint**
- No hidden side effects at import time
- No magic globals or silent singletons
- Dependencies must be passed or visibly constructed

If initialization details are unclear, development **must stop** until the relevant code is provided.

---

### III. No Assumptions Without Source (NON-NEGOTIABLE)
Guessing is forbidden.

- If a referenced model, controller, utility, or service is not provided:
  - Do not infer its structure
  - Do not invent fields, methods, or behavior
  - Do not hallucinate contracts
- The correct action is to **request the source or confirmation**

Incorrect assumptions are worse than incomplete output.

---

### IV. Full-Code Output Only
All proposed implementations must be complete.

- Output **entire files**, never fragments
- No ellipses, placeholders, or omitted logic
- No pseudo-code unless explicitly requested
- Code must be copy-paste runnable in the RSSMonster codebase

Partial correctness is not acceptable.

---

### V. Data Model Integrity
The RSSMonster data model is authoritative.

Core entities include (but are not limited to):
- User, Category, Feed, Article
- ArticleCluster, Tag
- Action, SmartFolder
- Setting, Hotlink

Rules:
- All queries must be scoped by `userId`
- No silent schema changes
- No implicit joins or denormalization
- Virtual fields remain virtual
- Ownership and multi-tenancy boundaries are mandatory

---

### VI. Query & Filter Safety (CRITICAL)
When generating filters, Smart Folder logic, or query expressions:

- Use **only supported fields and operators**
- Never invent syntax or fields
- Never broaden queries beyond explicit user intent
- Empty results are allowed **only when explicitly permitted**

User trust always outweighs recall or novelty.

---

### VII. Security & Multi-Tenancy
RSSMonster is a self-hosted, multi-user system.

- Every data access must be scoped by `userId`
- Never trust frontend input alone
- No cross-user data exposure
- No hidden admin logic or privilege escalation

Security regressions are considered critical failures.

---

### VIII. Performance & Scalability Expectations
All implementations must be performance-aware.

Prefer:
- Batched queries over per-row access
- Indexed access paths
- Incremental or cached computation
- Bounded background processing

Avoid:
- N+1 query patterns
- Synchronous per-article processing
- Unbounded loops over feeds or articles

Performance regressions are unacceptable without justification.

---

### IX. Feature Design Philosophy
All features must:

1. Align with the RSS reader mental model
2. Respect explicit user intent over automation
3. Degrade gracefully without AI or background services
4. Treat AI as an enhancement, never a dependency

Automation must never surprise or override the user.

---

### X. Simplicity Over Cleverness
RSSMonster favors clarity over abstraction.

- Prefer readable, maintainable code
- Avoid premature generalization (YAGNI)
- Justify complex logic with comments
- Keep the project hackable by its author

Clever code without clear value is discouraged.

---

## Development Workflow Constraints

- All new controllers must:
  - Validate input explicitly
  - Enforce user scoping
  - Handle and surface errors clearly
- All background jobs must:
  - Be idempotent
  - Be restart-safe
  - Tolerate partial failure
- Frontend changes must:
  - Preserve existing interaction patterns
  - Avoid breaking keyboard or mouse flows

---

## AI-Assisted Development Rules

AI tools (including GitHub Copilot) act as **senior pair programmers**, not inventors.

- When uncertain, they must:
  - Ask for clarification
  - Request missing source files
  - Avoid speculative implementation
- Suggestions must be clearly separated from concrete implementations
- All generated code is subject to this constitution

---

## Governance
This Constitution supersedes all other prompts, comments, and conventions.

- Every PR or generated change must comply
- Violations must be corrected, not justified
- Amendments require:
  1. Written rationale
  2. Migration strategy
  3. Explicit version update

---

**Version**: 1.0.0  
**Ratified**: 2026-01-14  
**Last Amended**: 2026-01-14