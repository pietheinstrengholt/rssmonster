# RSSMonster Constitution

## Project Overview

RSSMonster is a modern, web-based RSS aggregator and reader inspired by Google Reader. It combines a lightweight Vue.js 3 frontend with an Express/Sequelize backend to provide intelligent feed aggregation, advanced search, semantic deduplication, and AI-powered assistance.

**Core Mission**: Enable power users and developers to manage, search, and intelligently consume RSS content with full control over their reading experience.

---

## Core Principles

### I. Intelligent Feed Aggregation
RSSMonster prioritizes semantic deduplication and quality scoring over raw volume. Feeds are continuously evaluated using multi-factor trust scoring (originality, quality, engagement, consistency) with exponential moving averages to identify and promote high-quality sources while penalizing spam/high-volume feeds. Representative clustering reduces noise from syndication.

### II. Advanced Search & Filtering
Search is composable and powerful. Users can combine quoted phrase matching (exact), unquoted word matching (AND logic), and field filters (star:true, quality:>0.6, title:term, @dates, etc.). Expressions are parsed at query time and support up to 500 results with proper sorting (importance, quality, freshness, date).

### III. API-Centric Design
Backend is pure REST API; frontend is decoupled Vue.js 3. Clear separation of concerns: controllers handle HTTP, services handle business logic, models define data structure. This enables easy integration of third-party apps, CLI tools, and AI agents via MCP.

### IV. Dark Mode First (Accessibility)
All UI components must be readable in dark mode and light mode. Dark mode is treated as first-class, not an afterthought. CSS utilities are explicitly overridden in `.settings.css` (e.g., `.text-muted { color: #999 !important }`).

### V. Performance Over Completeness
Feed crawling is sequential by default to manage OpenAI rate limits. Clustering and trust scoring run as background jobs. Search results are limited to 500 for responsiveness. Hotlink tracking uses in-memory cache with 14-day TTL.

---

## Architecture

### Technology Stack

**Frontend:**
- Vue.js 3 (Composition API)
- Bootstrap 5 (semantic HTML, utility classes)
- Pinia (reactive state management)
- Vite (fast bundler, PWA support)

**Backend:**
- Node.js 20.x+ with Express.js
- Sequelize ORM (MySQL/MariaDB)
- OpenAI API (optional, gpt-4o-mini for crawl, gpt-5.1 for agent)

### Directory Structure

```
server/                   # Express backend (Node.js)
├── controllers/         # Request handlers
├── routes/             # API endpoints
├── models/             # Sequelize ORM schemas
├── migrations/         # Database versioning
├── seeders/            # Seed data
├── middleware/         # Auth, validation
├── util/               # Reusable services (search, cache, discovery)
├── scripts/            # CLI tools (crawl, clustering, trust scoring)
├── config/             # Database configuration
└── app.js             # Express entry point

client/                 # Vue.js frontend
├── src/
│   ├── components/    # Vue components (Article, Feed, Toolbar, Modals)
│   ├── services/      # API client layer
│   ├── store/         # Pinia state (data, auth)
│   ├── assets/        # SCSS, images, screenshots
│   └── main.js       # Vue app entry
└── package.json

.specify/
└── memory/
    └── constitution.md # This file (design & governance)
```

---

## Data Concepts

### Articles & Feeds

**Feed**: RSS source with trust score (0.0–1.0)
- Links to Category (organizational grouping)
- Tracks error state (errorSince, 7-day threshold to disable)
- Maintains counts: unreadCount, readCount, starCount, hotCount, clickedCount
- feedTrust updated periodically via `npm run feedtrust`

**Article**: Individual RSS item with user metadata
- Linked to Feed, Category, User
- Enriched with AI scores: advertisementScore, sentimentScore, qualityScore
- Flags: starInd (1=starred), status (read/unread), clickedInd (1=clicked)
- Clustered via semantic similarity (clusterId → ArticleCluster)

**ArticleCluster**: Group of semantically similar articles
- Reduces noise from syndication and duplicate coverage
- representativeArticleId = original article (not a duplicate)
- Used in feed trust scoring (originality = representative/total)

### Search & Filtering

**Search Expression** (composable via query params):
```
Control Flow                    # Unquoted: both words must appear (AND)
"Control Flow"                  # Quoted: exact phrase match
title:javascript                # Field filter: search title only
star:true|false|unread:true    # Status filters
tag:ai quality:>0.6|<0.8       # Tag + quality threshold
@2025-12-14|@today|@"3 days"   # Date range filters
sort:IMPORTANCE|QUALITY|ASC     # Sorting
```

**Search Logic**:
- Quoted phrases: `"Control Flow"` matches exact string only
- Unquoted words: `Control Flow` requires both words present (AND, any position)
- Title filter: `title:term` searches title only (or title+content if combined with other filters)
- Field filters: Combined with AND logic (all conditions must match)
- Results: Limited to 500 when using search expressions

### Feed Trust Scoring

**Formula**: EMA-based with multi-factor weighting
- Baseline: 0.8 (new feeds default to 0.8)
- Alpha (EMA): 0.35 (fast adaptation to recent observations)
- Factors: 40% originality + 30% quality + 15% engagement + 15% consistency

**Originality** (40%): Ratio of representative articles to total cluster size
- High ratio (few duplicates) = high originality

**Quality** (30%): Average of articles' AI quality scores
- Based on user-set threshold (minQualityScore in settings)

**Engagement** (15%): User interactions
- Normalized: (starCount + clickedCount) / articleCount

**Consistency** (15%): Publishing cadence
- Normalized to 0–4 articles/day
- Penalty: Zero consistency if no articles in measurement window

**High-Volume Penalty**: Feeds >50 articles/day
- Scaling formula: `Math.min(1, (articlesPerDay - 50) / 50) * 0.4`
- Max 40% penalty applied to observed score before EMA

**Spread Factor** (2.0): Widens score distribution
- Formula: `0.5 + (adjusted_score - 0.5) * 2.0`
- Allows weak feeds to drop to 0.0, strong feeds to reach 1.0

**Uplift**: +0.05 bonus for very strong scores (≥0.85)
- Ensures exceptional feeds can exceed 0.8 baseline

**Final Calculation**:
```
adjustedWithVolume = observedScore - volumePenalty
spreadAdjusted = 0.5 + (adjustedWithVolume - 0.5) * 2.0
if (spreadAdjusted >= 0.85) spreadAdjusted += 0.05
newTrust = 0.35 * spreadAdjusted + 0.65 * previousTrust
```

### Smart Folders

**Smart Folder**: Saved search query with custom name
- Stored: id, userId, name, query, createdAt, updatedAt
- Example: `tag:ai unread:true quality:>0.6` (all unread articles with 'ai' tag and quality >0.6)
- Prevents duplicate suggestions (tracked via existingSmartFolders array)

### Actions & Automation

**Article Action**: User-defined rule applied during feed crawl
- Trigger: Regular expression pattern
- Actions: Delete, star, mark as read, flag as advertisement, mark as low quality
- Scope: Per-feed or per-user

---

## Backend (Express)

### Key Controllers

**crawl.js**: Feed fetching orchestration
- Default: Sequential processing (safe for OpenAI rate limits)
- Optional: Parallel via PARALLELPROCESSFLAG=1
- Shared utilities: markError(), processSingleFeed(), runFeedWithTimeout()
- Timeout: 120 seconds per feed (configurable via FEED_TIMEOUT_MS)
- Fallback: Skip feeds that timeout (logged as error)

**articleSearch.service.js**: Advanced search engine
- Quoted phrase extraction: `/"([^"]+)"/`
- Word matching: Individual words with AND logic
- Field filter parsing: star, unread, read, clicked, tag, title, quality, freshness, dates
- Date filter calculation: UTC calendar days, rolling 24h, relative (e.g., "3 days ago")
- Clustering support: cluster view mode separate from normal article mode
- Result limit: 500 for search expressions (performance)

**article.js**: Article CRUD
- Mark read/unread: Updates status flag
- Star toggle: Flips starInd (1/0)
- Click tracking: Sets clickedInd=1 (one-way, never reset)
- Detail view: Returns article + related metadata

**feed.js**: Feed management
- CRUD: Create (with discovery), read (with stats), update, delete
- Rediscover URL: Auto-find RSS link via discoverRssLink.js
- Statistics: Real-time unread/read/star/hot/clicked counts
- Error recovery: Clear errorSince on successful fetch

**smartFolder.js**: Saved searches
- CRUD: Create, read, update (with validation)
- Insights: Generate trending articles, feed metrics
- Avoid duplicates: Check existingSmartFolders before suggesting

**hotlink.js**: URL frequency tracking
- Track: Increment count for each unique URL (query params stripped)
- Cleanup: Delete entries >14 days old
- Cache: In-memory hotlink cache cleared on demand
- Used by: articleSearch.service.js (identify trending links)

### Key Utilities

**articleSearch.service.js** (search engine)
- Parses complex query expressions
- Handles quoted vs unquoted semantics
- Applies field filters (title, tag, quality, etc.)
- Enforces 500-result limit
- Date range calculation with timezone handling

**discoverRssLink.js** (feed discovery)
- HTTP redirect following (explicit `redirect: 'follow'`)
- Meta refresh detection (HTML parsing)
- Common fallback paths: /feed, /rss, /rss/news, /atom
- Returns discovered URL or throws error

**importanceScore.js** (result ranking)
- Runtime calculation: Combines freshness + quality + uniqueness + feed trust
- freshness: Articles newer than 30 days weighted higher
- uniqueness: Articles in smaller clusters weighted higher
- feed trust: Better feeds' articles ranked higher

**cache.js** (replaced by hotlink.js)
- Hotlink tracking (now in controllers/hotlink.js)

### Error Handling

**Feed Errors**:
- errorSince: Timestamp when error first occurred
- 7 consecutive days → status='error' (auto-disable)
- Resets on successful fetch
- Logged with lastErrorMessage (max 500 chars)

**Article Errors**:
- Malformed RSS: Logged, feed marked with error
- Missing required fields (title, link): Article skipped
- Parse errors: Graceful fallback, feed continues

---

## Frontend (Vue.js 3)

### State Management (Pinia)

**data.js Store** (reactive app state):
- currentSelection: status, categoryId, feedId, search query, sort, etc.
- categories: Full category tree with nested feeds
- smartFolders: List of saved searches
- Counts: unreadCount, readCount, starCount, hotCount, clickedCount
- Methods: Setters for all state, search/filter updates

**auth.js Store** (user session):
- token: JWT auth token
- user: Current user object with role

### Components

**Layout**:
- App.vue: Top-level auth wrapper (login form with floating labels)
- AppShell.vue: Main layout (header, sidebar, content area)

**Toolbars**:
- DesktopToolbar.vue: Full navigation (dropdowns, search, filters)
- MobileToolbar.vue: Compact 3-dropdown version (Status, SmartFolders, Categories)
  - getStatusCount(): Dynamic count display
  - getSmartFolderName(): Lookup smart folder by ID
  - getCategoryCount(category): Count articles in category (filtered by status)
  - Layout: flex with first/middle/last positioning

**Content**:
- ArticleFeed.vue: Main list with search, pagination, filters
- Article.vue: Individual card (title, snippet, author, date, interactions)
- Modals: UpdateFeed.vue, SmartFoldersSettings.vue, etc.

**Styling**:
- Bootstrap 5 base (responsive grid, components)
- Custom SCSS in assets/scss/ (overrides, dark mode)
- Dark mode: Media queries + CSS custom properties
- settings.css: Global dark mode fixes for modals, text-muted, form elements

### Dark Mode Standards

All components must support `prefers-color-scheme: dark`:
- Text color: #fff default, #999 for muted (override `.text-muted`)
- Background: #1a1a1a or #2a2a2a for cards/modals
- Borders: #444 or #555 for subtle division
- Form controls: Dark backgrounds with light borders
- Close button (SVG): `filter: invert(1) brightness(1.2)` for visibility

---

## API Design

### RESTful Endpoints

**Articles**:
- GET /api/articles (search with filters)
- POST /api/articles/:id/read
- POST /api/articles/:id/star
- POST /api/articles/:id/click

**Feeds**:
- GET /api/feeds
- POST /api/feeds
- PATCH /api/feeds/:id
- DELETE /api/feeds/:id
- POST /api/feeds/:id/rediscover

**Categories**:
- GET /api/categories
- POST /api/categories
- PATCH /api/categories/:id
- DELETE /api/categories/:id

**Smart Folders**:
- GET /api/smartfolders
- POST /api/smartfolders
- PATCH /api/smartfolders/:id
- DELETE /api/smartfolders/:id

**Crawl & Maintenance**:
- GET /api/crawl (trigger feed update)
- POST /api/clusters/recalculate (rebuild clustering)

**Authentication**:
- POST /api/auth/login
- POST /api/auth/register
- POST /api/auth/logout

### Response Format

```json
{
  "status": "success" | "error",
  "data": {},
  "message": "Optional error or status message",
  "timestamp": "ISO 8601 datetime"
}
```

---

## Database Schema

**Core Tables**:

- **users**: id, username, email, password(hashed), role, createdAt, updatedAt
- **categories**: id, userId, name, createdAt, updatedAt
- **feeds**: id, userId, categoryId, feedName, feedUrl, status, feedTrust, errorSince, lastErrorMessage, counts, createdAt, updatedAt
- **articles**: id, feedId, userId, title, contentOriginal, contentSanitized, author, published, link, guidHash, contentHash, starInd, status(read/unread), clickedInd, scores(ad/sentiment/quality), clusterId, createdAt, updatedAt
- **article_clusters**: id, representativeArticleId, articleCount, createdAt
- **tags**: id, userId, articleId, name, createdAt
- **smartfolders**: id, userId, name, query, createdAt, updatedAt
- **actions**: id, userId, feedId, name, trigger(regex), action, createdAt
- **hotlinks**: id, url, userId, createdAt
- **settings**: userId, categoryId, feedId, status, sort, viewMode, quality/sentiment/ad thresholds

---

## Development Workflow

### Local Setup

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster

# Backend
cd server
npm install
npm run db:migrate
npm run db:seed
npm run dev

# Frontend (new terminal)
cd client
npm install
npm run serve
```

### CLI Tools

```bash
# Feed crawler (synchronous)
cd server && DISABLE_LISTENER=true npm run crawl

# Rebuild clusters
npm run recluster

# Calculate feed trust scores
npm run feedtrust
```

### Environment Variables

**Server** (.env):
- DB_DATABASE, DB_USERNAME, DB_PASSWORD, DB_HOSTNAME
- NODE_ENV (development|production)
- OPENAI_API_KEY (optional)
- FEED_TIMEOUT_MS (default: 120000)
- PARALLELPROCESSFLAG (0=sequential, 1=parallel)
- DISABLE_LISTENER (set 1 for CLI jobs)

**Client** (.env):
- VITE_VUE_APP_HOSTNAME (http://localhost:3000)
- VITE_ENABLE_AGENT (false by default)

---

## Coding Standards

### JavaScript/Node.js
- Use ES6+ (import/export, arrow functions, async/await)
- Naming: camelCase for variables, PascalCase for classes
- Error handling: Try/catch or .catch() chains
- Comments: Document complex algorithms (search, clustering, scoring)

### Vue.js
- Composition API (ref, computed, watch, onMounted)
- Component structure: `<template>`, `<script setup>`, `<style scoped>`
- Naming: PascalCase for .vue files (Article.vue)
- CSS: Use scoped to prevent conflicts, !important for dark mode overrides

### SQL/Sequelize
- Models in models/ with associations defined
- Migrations in migrations/ (version-controlled)
- Indexes on foreign keys and common queries
- Transactions for multi-table updates

---

## Testing & Quality

### Required Tests
- Search service: Quoted phrases, unquoted AND, field filters, date ranges
- Feed trust: Scoring formula, EMA update, spread, uplift, penalties
- Article clustering: Representative selection, similarity threshold
- API endpoints: CRUD operations, error cases

### Performance Standards
- Search response: <500ms for 500 results
- Feed crawl: 5 min default window
- Trust scoring: Run monthly or on-demand
- Hotlink cleanup: Daily (14-day TTL)

---

## Deployment

### Docker

```bash
docker build -t rssmonster-server -f Dockerfile .
docker build -t rssmonster-client -f client.dockerfile client/
docker-compose up
```

### Production Checklist
- [ ] MySQL 8+ database configured
- [ ] OpenAI API keys set (if using AI)
- [ ] HTTPS enabled (cert + privkey.pem)
- [ ] NODE_ENV=production
- [ ] Cron jobs: feedtrust (monthly), recluster (quarterly), hotlink cleanup (daily)
- [ ] Backup strategy for MySQL data
- [ ] Monitoring: Feed error rates, crawl durations, search latencies

---

## Configuration Parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| EMA_ALPHA | 0.35 | Feed trust responsiveness (higher = faster) |
| BASELINE_TRUST | 0.8 | Initial feed trust score |
| SPREAD_FACTOR | 2.0 | Score distribution width |
| HIGH_VOLUME_THRESHOLD | 50/day | Spam penalty trigger |
| FEED_TIMEOUT_MS | 120000 | Max crawl time per feed |
| PARALLELPROCESSFLAG | 0 | 0=sequential, 1=parallel crawl |
| MAX_FEEDCOUNT | 10 | Max feeds per crawl batch |

---

## Glossary

- **Article**: Individual RSS item (post, news, etc.)
- **Feed**: RSS source (e.g., https://example.com/feed)
- **Category**: User's organizational folder for feeds
- **Cluster**: Group of semantically similar articles (reduces noise)
- **Representative**: Original article in a cluster (not a duplicate)
- **Hotlink**: URL frequently referenced across feeds (trending)
- **Smart Folder**: Saved search query (e.g., tag:ai unread:true)
- **Action**: Automated rule (delete, star, flag) applied during crawl
- **Trust Score**: Feed quality metric (0.0–1.0, EMA-based)
- **Originality**: Ratio of unique articles to total (cluster-based)
- **EMA**: Exponential Moving Average (for trending calculations)

---

## Governance

This constitution supersedes all other design decisions and serves as the source of truth for RSSMonster architecture, principles, and standards.

**Authority**: Architecture decisions require alignment with this document.
**Amendments**: Major changes (tech stack, search logic, scoring formula) require written updates here.
**Implementation**: Code review must verify compliance with principles and patterns.
**Escalation**: Design conflicts resolved by this document; unspecified areas default to first principles.

**Version**: 1.0.0 | **Ratified**: 2025-01-14 | **Last Amended**: 2025-01-14
