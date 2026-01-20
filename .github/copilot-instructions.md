---
applyTo: '**'
---

# RSSMonster - Copilot Agent Instructions

## Repository Overview

RSSMonster is an intelligent RSS reader and aggregation engine built with a **Vue.js 3 frontend** and **Express backend using ESM modules**. The application provides advanced features including semantic article clustering, quality scoring, importance-based ranking, and AI-powered search capabilities through Model Context Protocol (MCP).

**Tech Stack:**
- **Backend:** Node.js 20+, Express 5.x (ESM only), Sequelize ORM, MySQL
- **Frontend:** Vue.js 3, Vite, Bootstrap 5, Pinia (state management)
- **Build Tools:** Vite for client, no build step for server (ESM)
- **Database:** MySQL 5.7+ with Sequelize migrations
- **Deployment:** Docker, Azure Static Web Apps (client), Azure Web App (server)

**Repository Size:** Small-to-medium monorepo with clear client/server separation.

### Backend Patterns

1. **ESM Only:** All server code uses ES modules (`import`/`export`). Do NOT use `require()`.
2. **Sequelize Models:** Factory-style models exported from `models/index.js`. Example:
   ```javascript
   import db from './models/index.js';
   const { Article, Feed, Category } = db;
   ```
3. **Routes:** Express routers imported in `app.js` and mounted at `/api/*` paths.
4. **Authentication:** JWT tokens managed by `auth.js` controller, verified by middleware.
5. **Database:** Migrations are sequential (timestamped). Never modify existing migrations.

### Frontend Patterns

1. **Vue 3 Composition API:** Most components use `<script setup>`.
2. **Bootstrap 5:** UI framework. Use existing Bootstrap classes, no custom CSS frameworks.
3. **Pinia Stores:** State management in `src/store/`.
4. **Axios Services:** API calls centralized in `src/services/`.
5. **PWA:** Configured via `vite-plugin-pwa`. Service worker auto-generated.

## Code Style & Conventions

- **Backend:** ESM modules, single-expression assignments preferred, preserve existing comments
- **Frontend:** Vue 3 Composition API, Bootstrap 5 classes only, Bootstrap Icons standard
- **Naming:** camelCase for variables/functions, PascalCase for components/models
- **Comments:** Minimal comments unless required for complex logic (match existing style)

## Project Structure

### Root Directory Layout

`/client/` (Vue.js frontend), `/server/` (Express backend), `/.github/workflows/` (CI/CD), `/.github/codeql/` (security config), `docker-compose.yml` (dev), `Dockerfile` (production build).

### Server Structure (`/server`)

**Key directories:** `app.js` (main setup), `bootstrap.js` (entry point), `models/` (Sequelize factory pattern), `controllers/` (business logic), `routes/` (Express routes including `fever.js`, `greader.js`, `mcp.js`, `agent.js`), `migrations/` (sequential), `seeders/` (demo data), `scripts/` (`crawl.js`, `reclusterArticles.js`, `calculateFeedTrust.js`), `config/config.cjs` (database config).

### Client Structure (`/client`)

**Key directories:** `src/main.js` (Vue init), `src/App.vue` (root), `src/components/` (Desktop/, Mobile/, Modals/, Onboarding/), `src/services/` (Axios API client), `src/store/` (Pinia), `vite.config.js` (PWA, SCSS config).