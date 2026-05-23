---
applyTo: '**'
---

# RSSMonster - Copilot Agent Instructions

## Repository Overview

RSSMonster is an intelligent RSS reader and aggregation engine built with a **Vue.js 3 frontend** and **Express backend using ESM modules**. The application provides advanced features including semantic article clustering, quality scoring, importance-based ranking, and AI-powered capabilities

**Tech Stack:**
- **Backend:** Node.js 20+, Express 5.x (ESM only), Sequelize ORM, MySQL
- **Frontend:** Vue.js 3, Vite, Bootstrap 5, Pinia (state management)
- **Build Tools:** Vite for client, no build step for server (ESM)
- **Database:** MySQL 5.7+ with Sequelize migrations
- **Deployment:** Docker

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
- **Frontend:** Vue 3 Composition API, Bootstrap 5 classes only, Bootstrap Icons standard. Single-expression assignments. Design must look sleek and stand out.
- **Naming:** camelCase for variables/functions, PascalCase for components/models
- **Comments:** Minimal comments unless required for complex logic (match existing style)

# Core Concepts

## Feed

A Feed represents an external RSS or Atom source.

Examples:
- Hacker News
- TechCrunch
- CNN
- Reddit RSS feeds

Purpose:
- Source of incoming articles
- Maintains crawl metadata and source identity

Relationships:
- A Feed has many Articles

## Article

An Article is the atomic content unit ingested from a feed.

Examples:
- A news post
- Blog article
- Podcast update
- Research publication

Purpose:
- Consumable content for users
- Stores embeddings and metadata
- Connected to Events

Important characteristics:
- Articles are ephemeral
- Articles should not be used as long-term semantic anchors
- Each article has a vector embedding

Relationships:
- Belongs to a Feed
- Belongs to an Event
- Can receive user interactions
- Can contribute to Interest Islands indirectly

## Event

An Event is a temporary cluster of semantically similar Articles.

Examples:
- "OpenAI releases GPT-6"
- "Apple announces new iPhone"
- "Databricks acquires company X"

Purpose:
- Deduplicate similar news coverage
- Group multiple articles discussing the same real-world event
- Reduce noise in recommendations

Important characteristics:
- Events are ephemeral and time-sensitive
- Events may merge or expire
- Events are generated through vector similarity clustering

Relationships:
- Contains many Articles
- Belongs to one or more Topics

## Topic

A Topic is a stable semantic category that groups related Events.

Examples:
- Generative AI
- Cloud Computing
- Cybersecurity
- European Politics
- Formula 1

Purpose:
- Central semantic layer of the recommendation system
- Long-lived representation of user interests
- Stable recommendation anchor

Important characteristics:
- Topics are durable and stable
- Topics outlive Events
- Topics may be curated, ML-generated, or hybrid
- Topics have embeddings

Relationships:
- Contains many Events
- Connected to Interest Islands
- Used for recommendation candidate generation

## Interest Island

An Interest Island is a coherent cluster of user interests.

An individual user can have multiple Interest Islands.

Examples:
- AI + Databricks + LLMs
- Geopolitics + China + Taiwan
- Formula 1 + Ferrari + Racing

Purpose:
- Represent multiple dimensions of user interests
- Avoid reducing a user to a single embedding
- Drive personalized recommendations

Important characteristics:
- Interest Islands are dynamic
- Generated from user behavior
- Have embeddings
- Connected primarily to Topics, not directly to Articles

Relationships:
- Belongs to a User
- Connected to Topics
- May temporarily connect to Events
- Built from interaction signals

# Recommendation Philosophy

The system is topic-centric, not article-centric.

The recommendation flow should be:

Interest Island
    ↓
Nearest Topics
    ↓
Active Events
    ↓
Best Articles

## User Interaction Signals

Interest Islands are built from behavioral signals.

Examples:

clickInd (e.g. "Clicked" vs "Not clicked")
starInd (e.g. "Starred" vs "Not starred")
negativeInd (e.g. "Not interested")

## Embedding Strategy

Embeddings are fundamental to the architecture.

Embeddings exist for:

Articles
Events
Topics
Interest Islands

Recommendations are generated using vector similarity and precomputed relations.

Heavy vector calculations should happen offline.

# Architectural Principles
1. Topics are the semantic backbone

Topics are the primary long-term semantic entity.

Events and Articles are transient.

2. Events reduce duplication

Multiple articles about the same news item should collapse into a single Event.

3. Users have multiple interests

Never model a user with a single embedding.

Use multiple Interest Islands.

4. Precompute relationships whenever possible

Avoid runtime-heavy vector searches.

Prefer cached and materialized relationships such as:

island_topics
topic_events
event_articles

# Data Model

## Core Tables
feeds
articles
events
topics
interest_islands
users

## Relation Tables
article_events
event_topics
user_islands
island_topics

# Processing Pipeline
Offline Processing

Runs asynchronously:

article embeddings
event clustering
topic assignment
island generation
affinity calculations

# Vector hierarchy
Article Vector      = semantic content
Event Vector        = current news story
Topic Vector        = stable knowledge domain
Interest Vector     = user preference profile

## Article vectors
Purpose: Represent the actual semantic meaning of a single article.

Generated from:

title
summary
extracted content
entities
keywords

Important: Immutable after creation.

## Event vectors
Purpose: Represent the center of a cluster of similar articles.

Usually:

event.vector = centroid(article vectors)

Important: Recomputed as articles are added. Articles SHOULD NOT always require an Event assignment. Articles MAY belong to: zero events, one event, multiple events (rare)

## Topic vectors

This is the most important vector layer.

Purpose: Represent a long-term semantic domain.

How to build them

Usually:

topic.vector = weighted centroid(event vectors)

Important: Slowly evolves over time. Should NOT fluctuate heavily. Do NOT force all events into topics.

Some events are: too small, too transient, too ambiguous

## Interest Island vectors

This is effectively the user's semantic identity.

Purpose: Represent a coherent cluster of user interests.

Island vector =
  70% topic affinities
  20% event affinities
  10% recent article interactions

When using articles to influence the island vector, we should weight them by interaction type:

clicked articles
starred articles
negatively interacted articles

Important: Most dynamic vector in the system. Should evolve continuously.