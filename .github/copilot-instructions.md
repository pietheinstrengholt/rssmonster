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

## Critical Setup Requirements

### Environment Configuration (REQUIRED)

**ALWAYS** create environment files before running anything:

```bash
# Server configuration (REQUIRED)
cp server/.env.example server/.env

# Client configuration (REQUIRED)
cp client/.env.example client/.env
```

**Server `.env` minimum required variables:**
- `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_HOSTNAME` - Application WILL NOT START without these
- `NODE_ENV` - Set to `development` for local work, `production` for deployment
- `OPENAI_API_KEY`, `OPENAI_MODEL_AGENT`, `OPENAI_MODEL_CRAWL` - Optional, only needed for AI features

**Client `.env` minimum required variables:**
- `VITE_VUE_APP_HOSTNAME` - Backend URL (default: `http://localhost:3000`)
- `VITE_NODE_ENV` - Set to `development` or `production`

### Database Setup (REQUIRED)

**ALWAYS run migrations before starting the server:**

```bash
cd server
./node_modules/.bin/sequelize db:migrate
./node_modules/.bin/sequelize db:seed:all  # Optional: seed demo data
```

**Note:** Server will crash on startup if database is not migrated.

## Build & Development Commands

### Installation (ALWAYS run before first build)

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

**Time:** ~10-15 seconds per directory. No special flags needed.

### Development Mode

**Client (Hot Reload):**
```bash
cd client
npm run dev
```
- Runs on `http://localhost:8080` (configured in vite.config.js)
- Hot module replacement enabled
- **Time:** ~2-3 seconds to start

**Server (With Debugging):**
```bash
cd server
npm run debug
```
- Runs on `http://localhost:3000`
- Uses nodemon for auto-restart on file changes
- **Time:** ~2-3 seconds to start
- **IMPORTANT:** Server watches `server` directory only (`.js` and `.json` files with 100ms delay)

### Production Build

**ALWAYS follow this exact sequence for production:**

```bash
# 1. Build client
cd client
npm run build
# Creates client/dist directory (~8-10 seconds)

# 2. Move built files to server (if deploying as monolith)
mv dist ../server/

# 3. Start server in production mode
cd ../server
NODE_ENV=production npm run start
```

**Note:** Client build produces warnings about chunk sizes >1000 kB. This is expected and can be ignored.

### Utility Scripts (Server Only)

```bash
cd server

# Feed crawling (sync, shows output)
DISABLE_LISTENER=true npm run crawl

# Rebuild article clusters (requires embeddings)
npm run recluster

# Calculate feed trust scores
npm run feedtrust
```

## Project Structure

### Root Directory Layout

`/client/` (Vue.js frontend), `/server/` (Express backend), `/.github/workflows/` (CI/CD), `/.github/codeql/` (security config), `docker-compose.yml` (dev), `Dockerfile` (production build).

### Server Structure (`/server`)

**Key directories:** `app.js` (main setup), `bootstrap.js` (entry point), `models/` (Sequelize factory pattern), `controllers/` (business logic), `routes/` (Express routes including `fever.js`, `greader.js`, `mcp.js`, `agent.js`), `migrations/` (sequential), `seeders/` (demo data), `scripts/` (`crawl.js`, `reclusterArticles.js`, `calculateFeedTrust.js`), `config/config.cjs` (database config).

### Client Structure (`/client`)

**Key directories:** `src/main.js` (Vue init), `src/App.vue` (root), `src/components/` (Desktop/, Mobile/, Modals/, Onboarding/), `src/services/` (Axios API client), `src/store/` (Pinia), `vite.config.js` (PWA, SCSS config).

## GitHub Actions CI/CD

### Workflows

1. **`azure-static-web-apps.yml`** - Client deployment (triggers on `master` push, ignores `server/**`, runs CodeQL)
2. **`azure-web-app-server.yml`** - Server deployment (triggers on `master` push, ignores `client/**`)

### CodeQL Security Scanning

**Config:** `.github/codeql/codeql-config.yml` - Scans JavaScript in `client/src` only, ignores `client/dist` and `client/dev-dist`.

## Key Architectural Patterns

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

## Common Issues & Workarounds

- **Server crashes "Missing required env var":** Copy `server/.env.example` to `server/.env` with database credentials.
- **Client build chunk size warnings:** Expected. Ignore or adjust `build.chunkSizeWarningLimit` in `vite.config.js`.
- **Database migration fails:** Ensure MySQL running. Check `server/config/config.cjs` connection settings.
- **CORS errors:** Ensure client `.env` has correct `VITE_VUE_APP_HOSTNAME` pointing to backend.
- **Deprecated package warnings:** Ignore `sourcemap-codec` and `source-map@0.8.0-beta.0` (transitive dependencies).

## Testing

**No automated tests exist.** Manual testing required: Start server (`npm run debug`) and client (`npm run dev`), navigate to `http://localhost:8080`, verify login and core features.

## Docker Development

**Dev with docker-compose:** `docker-compose build && docker-compose up` - Runs client (:8080), server (:3000), mysql (:3306)

**Production Docker:** `docker build -t rssmonster . && docker run -p 3000:3000 -e DB_HOSTNAME=... rssmonster`

## Code Style & Conventions

- **Backend:** ESM modules, single-expression assignments preferred, preserve existing comments
- **Frontend:** Vue 3 Composition API, Bootstrap 5 classes only, Bootstrap Icons standard
- **Naming:** camelCase for variables/functions, PascalCase for components/models
- **Comments:** Minimal comments unless required for complex logic (match existing style)

## Validation Checklist

Before submitting changes, ALWAYS verify:

1. **Environment files created** (`server/.env`, `client/.env`)
2. **Dependencies installed** (`npm install` in both directories)
3. **Database migrated** (`./node_modules/.bin/sequelize db:migrate`)
4. **Client builds successfully** (`npm run build` in client/, ~8-10 sec)
5. **Server starts without errors** (`npm run debug` in server/)
6. **No ESM/CommonJS mixing** (use `import`, not `require`)
7. **CodeQL paths excluded** (check `.github/codeql/codeql-config.yml`)

## Trust These Instructions

These instructions are based on actual repository exploration and validated commands. Use this file as the primary reference to minimize exploration time. Only perform additional searches if information here is incomplete or results in errors.
