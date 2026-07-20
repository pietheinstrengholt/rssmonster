# Agents.md — RSSMonster

This is the **operator manual** for AI agents working in this repository.
It prioritizes correctness, low-risk changes, and consistency with existing code.

---

## 1) Agent Contract (How to Work Here)

When you make changes in RSSMonster, optimize for:

1. **Correctness first** — behavior must remain valid in production and tests.
2. **Small diffs** — prefer minimal, focused edits over broad rewrites.
3. **Local consistency** — follow surrounding patterns before introducing new ones.
4. **Verifiability** — run targeted checks for touched areas.
5. **Clear handoff** — leave concise notes in commit/PR messages.

If a request conflicts with these principles, call out the risk and choose the safest compliant path.

---

## 2) Repo Reality (What You’re Working In)

- Monorepo with:
  - `server/`: Express 5 + Sequelize + MySQL
  - `client/`: Vue 3 + Vite + Pinia + Bootstrap 5
- Node.js 20+
- ESM in app packages (`"type": "module"`)

Key entry points:
- Server: `server/bootstrap.js` → `server/app.js`
- Client: `client/src/main.js`

---

## 3) Change Strategy (Best-Practice Workflow)

Use this sequence for most tasks:

1. **Orient quickly**
   - Read relevant module(s) and adjacent tests.
   - Confirm the existing pattern you should imitate.
2. **Plan a minimal patch**
   - Change only what is required for the request.
   - Avoid opportunistic refactors unless asked.
3. **Implement with guardrails**
   - Preserve public contracts unless the task is explicitly breaking-change work.
4. **Validate proportionally**
   - Run lint/tests closest to changed code first.
5. **Summarize clearly**
   - State what changed, why, and what was verified.

---

## 4) Non-Negotiable Technical Rules

### 4.1 Modules and Imports
- Use `import`/`export` (ESM) in application code.
- In **server** local imports, include `.js` extension.
- Do not introduce `require()` in app runtime files.
- Migration files are the exception (CommonJS `module.exports`).

### 4.2 Sequelize Model Access
- Import models through `server/models/index.js` only:
  ```js
  import db from '../models/index.js';
  const { Article, Feed, Category } = db;
  ```
- Do not import model definition files directly.

### 4.3 Controllers and Auth
- Wrap handlers in `try/catch`.
- Log with actionable context, e.g. `console.error('Error in fnName:', err)`.
- Verify `req.userData.userId`; return 401 when absent.
- Prefer early-return validation.

### 4.4 Routing
- Keep route modules thin (middleware + controller wiring).
- API routes are mounted under `/api/*` in `server/app.js`.

### 4.5 Database Migrations
- Add new migration files; do not edit old applied migrations.
- Filename format: `YYYYMMDDHHMMSS-description.js`.
- Use FK cascades where appropriate:
  `onUpdate: 'CASCADE'`, `onDelete: 'CASCADE'`.

### 4.6 Frontend Architecture
- Use Vue 3 **Options API** in this repo.
- Do not introduce `<script setup>` patterns.
- Use Bootstrap 5 and Bootstrap Icons.
- Add dark-mode styling support for new UI styles:
  `@media (prefers-color-scheme: dark)`.

### 4.7 API and Store Layers
- `client/src/api/`: named exports, concise functions, shared Axios client.
- Let API errors bubble; avoid redundant per-method error wrappers.
- `client/src/store/`: options-style Pinia stores; alias API imports with `API` suffix.

### 4.8 HTML URL Processing
- `normalizeHtmlUrls()` owns canonicalization and converts relative URLs into absolute HTTP(S) URLs.
- `sanitizeHtmlContent()` owns safety by validating and filtering URLs and attributes, but does not guarantee canonical absolute URLs on its own.

### 4.9 Daily Briefing Preferences
- `BriefingPreference` is a one-to-one, user-owned record; do not create more than one row per user.
- `selectionPeriod` persists only `24h` or `7d`, with `7d` as the default.

---

## 5) Quality Gates (What to Run)

Choose the smallest checks that prove your change is safe.

### Server changes
```bash
cd server
npm run lint
npm test
```

### Client changes
```bash
cd client
npm run lint
npm test
npm run build
```

### Full stack (when integration behavior is affected)
```bash
docker-compose up
```

Testing notes:
- Vitest is used in both packages.
- Server tests use real DB behavior (not Sequelize model mocks).
- `supertest` is the expected HTTP test approach.
- `DISABLE_LISTENER` can suppress server listen side effects in tests.

---

## 6) High-Signal Pitfalls (Frequently Causes Regressions)

- Reading a `fetch` response body twice without `response.clone()`.
- Importing Sequelize models directly instead of via `models/index.js`.
- Using Express 4 idioms incompatible with Express 5 behavior.
- Forgetting `.js` extension in server local imports.
- Modifying existing migrations instead of adding new ones.
- Introducing frontend patterns inconsistent with existing Options API code.

All post-crawl semantic processing operates only on **new, unfiltered articles**.
Every downstream candidate query must independently enforce the matching `userId`,
`Article.createdAt >= createdAtFrom`, and `filteredInd = false`. Embedding must also
require a missing article vector. This scope must never use `updatedAt`; publisher
revisions update `updatedAt` and do not re-enter the semantic pipeline.
Historical semantic processing requires an explicit rebuild workflow.

---

## 7) Preferred Style Defaults

- Naming:
  - `camelCase`: vars/functions
  - `PascalCase`: Vue components
  - `UPPER_SNAKE_CASE`: constants
- Keep functions cohesive and readable; prefer early returns.
- Comment each function with a brief sentence what this is about. For example // This function handles user login. Complex logic should have inline comments.
- Follow lint rules rather than personal formatting preferences.

---

## 8) File Map (Fast Navigation)

- Server
  - App bootstrap: `server/bootstrap.js`, `server/app.js`
  - Controllers: `server/controllers/`
  - Routes: `server/routes/`
  - Models: `server/models/`
  - Migrations: `server/migrations/`
  - Scripts: `server/scripts/`
  - Util: `server/utils/` # helpers, middleware, etc.
  - Services: `server/services/` # business logic for processing articles, events, topics, islands, etc.
- Client
  - Root app: `client/src/App.vue`, `client/src/AppShell.vue`
  - Components: `client/src/components/`
  - API services: `client/src/api/`
  - Stores: `client/src/store/`
  - Global styles: `client/src/assets/scss/global.scss`

---

## 9) Definition of Done for Agent Changes

A change is done when all are true:

1. Requested behavior is implemented.
2. Diff is minimal and consistent with local code patterns.
3. Relevant lint/tests/build checks pass (or limitations are documented).
4. No unrelated refactors are bundled.
5. Commit and PR notes clearly explain scope and validation.

## 10) UI Design Philosophy

Build a calm, content-first reading experience inspired by Feedbin, Reeder, Readwise Reader, Apple Mail, and Linear.

### Core Principles

- Content is more important than chrome.
- Prefer whitespace over visual decoration.
- Use a single accent color for selection states.
- Avoid gradients, glass effects, excessive shadows, and unnecessary animations.
- Typography is the primary visual hierarchy.
- Optimize for long reading sessions.

### Visual Style

- Minimalist
- Professional
- Calm
- Dense but not cluttered
- Similar to Feedbin, Reeder, Readwise Reader, and Linear

### Avoid

- Material Design dashboards
- Card-heavy layouts
- Large hero headers
- Bright colors
- Excessive icons
- Marketing-style UI patterns

The application should feel like a professional knowledge management tool rather than a consumer news website.
