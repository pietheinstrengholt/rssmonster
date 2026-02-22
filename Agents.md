# Agents.md — Coding Agent Best Practices for RSSMonster

This document captures observed patterns, conventions, and pitfalls in the RSSMonster codebase. Follow these guidelines to produce consistent, idiomatic contributions.

---

## 1. Module System

### ESM Everywhere (Except Migrations)

All server and client code uses ES modules. Never use `require()` in any `.js` file.

```javascript
// ✅ Correct
import express from 'express';
import db from '../models/index.js';

// ❌ Wrong
const express = require('express');
```

**Migration files are the sole exception.** Sequelize CLI requires CommonJS:

```javascript
// migrations/20260101000000-create-example.js
'use strict';
module.exports = { up, down };
```

### File Extensions

- **Server imports:** Always include `.js` extension (`import db from '../models/index.js'`). Node.js ESM requires it.
- **Client imports:** Omit extensions (`import api from './client'`). Vite resolves them.

---

## 2. Backend Patterns

### Model Imports — The Two-Line Pattern

Models are always imported through the central `models/index.js`, never directly. Use a two-line destructure:

```javascript
import db from '../models/index.js';
const { Article, Feed, Category, Tag } = db;
```

Never do `import Article from '../models/article.js'` — models require Sequelize initialization and association wiring from `index.js`.

### Model Definition — Factory Pattern

Every model file exports a factory function that receives the Sequelize instance:

```javascript
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const MyModel = sequelize.define('table_name', {
    // columns...
  }, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  });
  return MyModel;
};
```

Key conventions:
- Table names: **plural lowercase** (`articles`, `feeds`, `tags`)
- Column names: **camelCase** (`feedName`, `errorCount`, `starInd`)
- Always use `utf8mb4` charset
- Associations are defined in `models/index.js`, *not* in individual model files

### Controller Pattern

Controllers are collections of async handler functions gathered into a default export object:

```javascript
const listThings = async (req, res, _next) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }
    // ... business logic ...
    return res.status(200).json({ data });
  } catch (err) {
    console.error('Error in listThings:', err);
    return res.status(500).json({ error: err.message });
  }
};

export default { listThings, createThing, deleteThing };
```

Rules:
- Every handler takes `(req, res, _next)` — prefix unused params with `_`
- Every handler is wrapped in try/catch
- Error logging: `console.error('Error in functionName:', err)`
- Error response: `res.status(500).json({ error: err.message })` or `{ error_msg: ... }` for user-facing errors
- Auth check: `req.userData.userId` from JWT middleware, return 401 if missing
- Use early returns for validation (`if (!x) return res.status(400)...`)

### Route Pattern

Routes are thin — just wire middleware and controller methods:

```javascript
import express from 'express';
import controller from '../controllers/thing.js';
import userMiddleware from '../middleware/users.js';

export const router = express.Router();

router.get('/', userMiddleware.isLoggedIn, controller.list);
router.post('/', userMiddleware.isLoggedIn, controller.create);

export default router;
```

Routes are mounted in `app.js` at `/api/*` paths (except `/mcp`, `/agent`, `/rss` which have their own prefixes).

### Utility Modules

Utility files in `server/util/` use dual exports:

```javascript
export const myFunction = async (arg) => { ... };

export default { myFunction };
```

This allows both `import { myFunction } from './util/thing.js'` and `import thing from './util/thing.js'; thing.myFunction()`.

### Database Migrations

- Filename format: `YYYYMMDDHHMMSS-description.js`
- **Never modify existing migrations.** Always create a new one.
- Use `Sequelize.fn('NOW')` for timestamp defaults
- Foreign keys: always set `onUpdate: 'CASCADE'`, `onDelete: 'CASCADE'`
- Index naming: `tableName_columnName_idx`
- `down` migration: remove indexes first, then drop table

### Environment Variables

```javascript
// Numeric with default
const PORT = parseInt(process.env.PORT) || 3000;

// Boolean check
const SKIP_ANALYSIS = process.env.SKIP_OPENAI_ANALYSIS === 'true';

// Required check (app.js validates at startup)
if (!process.env.DB_DATABASE) throw new Error('Missing required env var: DB_DATABASE');
```

### Entry Point Chain

`bootstrap.js` → loads dotenv → dynamically imports `app.js` → `app.js` validates env vars, sets up Express, calls `startServer()`. The `DISABLE_LISTENER` env var suppresses the HTTP listener (used in tests).

---

## 3. Frontend Patterns

### Vue Component Style

Components use the **Options API** (`export default { ... }`), not `<script setup>`:

```vue
<script>
import { someApiCall } from '../api/things';
export default {
  name: 'MyComponent',
  data() { return { ... }; },
  methods: { ... },
  computed: { ... }
};
</script>
```

Despite the copilot-instructions mentioning Composition API, the actual codebase consistently uses Options API. Match the existing style.

### API Service Layer

API calls live in `client/src/api/` as named-export single-expression arrows with JSDoc:

```javascript
import api from './client';

/** Fetch all things */
export const fetchThings = () =>
  api.get('/things');

/** Create a thing */
export const createThing = (data) =>
  api.post('/things', data);
```

- No default exports — only named exports
- No error handling — errors bubble to callers
- The shared Axios instance (`api`) adds auth headers and handles 401 interception

### Pinia Store Convention

```javascript
import { defineStore } from 'pinia';
import { fetchThings as fetchThingsAPI } from '../api/things';

export const useStore = defineStore('storeName', {
  state: () => ({ /* ... */ }),
  actions: { /* ... */ }
});
```

- Options-style Pinia (not `setup()` stores)
- API imports renamed with `API` suffix to avoid collisions with store actions
- Section headers: `/* ---- State ---- */`

### CSS and Styling

- **Bootstrap 5 only** — use existing classes, never introduce another CSS framework
- **Bootstrap Icons** via `<BootstrapIcon name="icon-name" />` component
- **Dark mode** via `@media (prefers-color-scheme: dark)` — always provide dark variants for new styles
- **Scoped styles** in components when possible
- **Global SCSS** imported from `src/assets/scss/global.scss`
- **Bootswatch** theme applied

### Error Handling in Frontend

- API errors in components: catch in try/catch, display via `error_msg` data property
- Global errors: dispatched via `window.dispatchEvent(new CustomEvent('app:error', { detail }))` and caught by `AppShell.vue`
- Auth expiration: `window.dispatchEvent(new Event('auth:expired'))` triggers logout
- Always check `error.response?.data?.error_msg` before using generic fallback messages

---

## 4. Testing

### Framework

- **Vitest** for both server and client
- Server: `environment: 'node'`, `globals: true`, `testTimeout: 10000`
- Client: `environment: 'jsdom'`, `globals: true`

### Server Test Pattern

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';

const { sequelize, User, Category, Feed } = db;

describe('Feature name', () => {
  let user;

  beforeAll(async () => {
    await sequelize.authenticate();
    const hash = await bcrypt.hash('secret', 10);
    user = await User.create({ username: 'testuser', password: 'secret', hash, role: 'user' });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('does something', async () => { ... });
});
```

- Tests run against a **real database** (no mocks for Sequelize)
- `helpers/resetDb.js` does `sequelize.sync({ force: true })` for full resets
- `beforeAll` hooks that import `app.js` need extended timeout (30s) due to DB connection + module loading
- Express smoke tests use `supertest`

### Client Test Pattern

```javascript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Component from '../src/components/Component.vue';

describe('Component', () => {
  it('mounts without crashing', () => {
    const wrapper = mount(Component);
    expect(wrapper.exists()).toBe(true);
  });
});
```

---

## 5. Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Variables / functions | camelCase | `feedName`, `getArticles` |
| Constants | UPPER_SNAKE_CASE | `CRAWL_TIMEOUT_MS`, `NEUTRAL_SCORE` |
| Vue components | PascalCase | `ArticleFeed`, `NewCategory` |
| Component registration | kebab-prefix | `appArticleFeed`, `appNewCategory` |
| Database tables | plural lowercase | `articles`, `feeds`, `tags` |
| Database columns | camelCase | `feedId`, `starInd`, `errorCount` |
| API functions | verb + noun | `fetchFeeds`, `createFeed`, `deleteFeed` |
| Migration files | timestamp-description | `20260101000000-create-things.js` |
| Unused params | underscore prefix | `_next`, `_req` |
| Emitted events | hyphenated | `force-reload`, `update-star` |

---

## 6. Common Pitfalls

### Don't Read Response Body Twice
Node.js `fetch` Response bodies can only be consumed once. Use `response.clone()` if you need to read it twice, and call `clone()` *before* any `.text()` or `.json()` call.

### Cloudflare-Protected Feeds
Some RSS feeds are behind Cloudflare bot protection (403 responses). The `discoverRssLink` utility detects this via the `server: cloudflare` response header and returns `{ cloudflare: true, url }` instead of a string. Callers must handle both return types.

### Sequelize Op Import
Always import operators explicitly:
```javascript
import { Op } from 'sequelize';
// or from the db object
const { Sequelize } = db; // then use Sequelize.Op
```

### Express 5 Compatibility
Express 5.x is used. Route param callbacks and some Express 4 patterns may not work. Test route changes carefully.

### Don't Hardcode Scores
Quality scores use `NEUTRAL_SCORE = 70` as the baseline. The frontend `quality` display is a **virtual field** computed as a weighted blend: `(sentimentScore × 0.5 + qualityScore × 0.35 + advertisementScore × 0.15)`. Don't assume `qualityScore` directly maps to displayed values.

### Migration Safety
Never alter existing migration files. The migration system tracks which files have run. If you need to change schema, create a new migration.

### PWA Considerations
The app is a Progressive Web App. Changes to static assets, service worker config, or caching behavior need testing in both install and update flows.

---

## 7. Code Style Quick Reference

From ESLint configs (identical across server/client):
- `prefer-const: error` — use `const` unless reassignment is needed
- `arrow-body-style: 'as-needed'` — omit braces for single-expression arrows
- `object-curly-spacing: 'always'` — `{ foo }` not `{foo}`
- `brace-style: '1tbs'` with `allowSingleLine`
- `no-console: off` — console usage is allowed
- `no-unused-vars: warn` with `argsIgnorePattern: '^_'`
- Vue: `multi-word-component-names: off`

### Section Headers

Use boxed comment headers to organize code sections:

```javascript
/* ---- Configuration ---- */
const TIMEOUT = 5000;

/* ---- Helpers ---- */
const normalize = (s) => s.trim().toLowerCase();

/* ---- Main logic ---- */
export const process = async () => { ... };
```

### Comment Philosophy

Minimal comments. Don't add comments that restate what the code does. Add them only for:
- Non-obvious business logic
- Workarounds with a "why"
- Section organization in long files
