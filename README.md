# RSSMonster

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)
[![Client coverage](https://codecov.io/gh/pietheinstrengholt/rssmonster/branch/master/graph/badge.svg?flag=client)](https://codecov.io/github/pietheinstrengholt/rssmonster/tree/master/client)
[![Server coverage](https://codecov.io/gh/pietheinstrengholt/rssmonster/branch/master/graph/badge.svg?flag=server)](https://codecov.io/github/pietheinstrengholt/rssmonster/tree/master/server)
[![Docker](https://img.shields.io/docker/pulls/rssmonster/rssmonster.svg)](https://hub.docker.com/r/rssmonster/rssmonster/builds)
[![CI](https://github.com/pietheinstrengholt/rssmonster/actions/workflows/ci.yml/badge.svg)](https://github.com/pietheinstrengholt/rssmonster/actions/workflows/ci.yml)

Copyright (c) 2026 Piethein Strengholt, [piethein@strengholt-online.nl](mailto:piethein@strengholt-online.nl)

## Overview

RSSMonster is a **self-hosted, intelligent RSS reader** designed to help you cut through information overload and focus on what actually matters.

[Learn more about RSSMonster in the complete documentation.](https://pietheinstrengholt.github.io/rssmonster/)

Traditional RSS readers are primarily organized around feeds, folders, and chronological article streams. RSSMonster adds a semantic and ranking layer on top: it groups articles covering the same event, evaluates signals such as quality, freshness, originality, and source trust, explains why stories rank highly, and lets you create declarative **Smart Folders** for the views that matter to you.

![Screenshot](docs/assets/screenshot04.png)

At its core, RSSMonster treats your feeds as a stream of signals rather than a pile of unread items. New articles are enriched with quality, freshness, originality, trust, attention, and semantic relationship metadata. That extra context lets the application answer better questions: *is this worth reading now?*, *is this just syndicated copy?*, *which sources are covering the same event?*, and *which broader storyline does this belong to?*

A conventional reader effectively sees:

```text
Article
Article
Article
Article
Article
Article
```

RSSMonster can increasingly interpret that as:

```text
               Topic
                 │
          Nintendo / Zelda
                 │
        ┌────────┴─────────┐
        │                  │
      Event             Related
        │               content
    ┌───┼───┐
    A   B   C
        │
   duplicates
```

![Screenshot](docs/assets/screenshot05.png)

RSSMonster combines advanced search expressions, semantic clustering, quality analysis, and importance-based ranking into a system where **views are declarative, not hard-coded**. Instead of fixed tabs and opaque algorithms, you define *what matters* using composable queries that power dynamic **Smart Folders** such as:

* *Top Stories Today* — importance-ranked, deduplicated coverage
* *Worth Your Time* — high-quality, original long-form content
* *Quick Scan* — summary-first daily overview
* *Low Noise Mode* — maximum signal, minimal volume

Ranking decisions are explainable and views are customizable. The result is a reader that can behave like a quick daily briefing, a research inbox, a low-noise monitoring tool, or a classic feed reader depending on the view you choose.

## Why RSSMonster?

* **Semantic event discovery**: RSSMonster groups reporting about the same real-world story into one expandable event, so several headlines from different sources become one event with multiple articles.
* **Importance- and quality-aware ranking**: Freshness, personal interest, article quality, breadth of coverage, source diversity, corroboration, and source trust help surface worthwhile stories without hiding the underlying signals.
* **Declarative Smart Folders**: Composable search expressions turn your own definition of “important” into reusable, dynamic reading views.
* **Simple self-hosting**: Run RSSMonster with SQLite as a single-container personal installation, or use MySQL for larger and higher-concurrency deployments.
* **Self-hosted and transparent**: Your feeds and reading data stay under your control, and ranking dimensions remain inspectable instead of disappearing inside an opaque recommendation system.

## Docker Quick Start

SQLite is the recommended database for simple, personal RSSMonster installations. It requires no separate database server and keeps the deployment to a single application container.

### 1. Clone RSSMonster

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

### 2. Configure Application Secrets

Create a `.env` file in the repository root:

```env
JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-long-random-secret
```

Generate secure values with:

```bash
openssl rand -hex 32
```

Run the command twice and use a different value for each secret.

### 3. Start RSSMonster

```bash
docker compose up -d
```

The default `docker-compose.yml` uses SQLite and stores the database in a persistent Docker volume.

On first startup RSSMonster automatically:

* creates the SQLite database file;
* applies pending Sequelize database migrations;
* starts the application.

Open:

```text
http://localhost:3000
```

and create your first account.

Check the deployment:

```bash
docker compose ps
```

Follow the application logs:

```bash
docker compose logs -f rssmonster
```

### Updating RSSMonster

Pull the latest image and recreate the container:

```bash
docker compose pull
docker compose up -d
```

Pending database migrations are applied automatically when the container starts.

### Data Persistence

SQLite data is stored in the persistent Docker volume mounted inside the container at:

```text
/app/data
```

The SQLite files can include:

```text
rssmonster.sqlite
rssmonster.sqlite-wal
rssmonster.sqlite-shm
```

Do not remove the Docker volume unless you intentionally want to delete your RSSMonster database.

To stop RSSMonster without deleting its data:

```bash
docker compose down
```

Avoid:

```bash
docker compose down -v
```

unless you deliberately want to remove the persistent database volume.

### MySQL Deployment

MySQL remains supported and is recommended for installations that need higher write concurrency, multiple active users, or more demanding workloads.

Use the separate MySQL Compose configuration:

```bash
docker compose -f docker-compose.mysql.yml up -d
```

Configure the required database credentials and application secrets before starting the MySQL deployment. MySQL is expected to be running and reachable before the RSSMonster container starts.

## Key Features

* **Flexible reading modes**: Use Reader Mode for summaries beside a details panel, List Mode for fast headline scanning, or Expanded Mode for distraction-free full articles. Keyboard shortcuts, drag-and-drop organization, dark mode, and mobile swipe gestures support efficient reading.
* **Semantic event discovery**: Group related reporting, compare sources, identify duplicate coverage, and connect events to broader topics and personal interest islands.
* **Smart Folders**: Build reusable views with queries such as `@today unread:true sort:recommended`, `unread:true quality:>0.7 sort:quality`, or `event:true island:true eventCount:>=3 sort:recommended`.
* **Advanced search**: Combine article state, dates, tags, text, semantic filters, score thresholds, and sorting. See the [search guide](docs/search.md) for the supported operators.
* **Transparent ranking signals**: Recommended ordering considers freshness, interest, quality, event coverage, publisher diversity, corroboration, rule tags, and optional feed-trust preference. Quality, uniqueness, attention, and feed trust remain visible signals with dedicated sorting or filtering where supported.
* **PWA and mobile support**: Install RSSMonster on supported devices for an app-like experience with offline support and responsive controls.
* **OPML and generated RSS**: Import or export subscriptions through OPML, and create filtered RSS feeds from stored articles through the `/rss` endpoint.
* **Third-party client compatibility**: Connect Fever clients such as Reeder or Google Reader clients including News+, FeedMe, Reeder, Vienna RSS, and ReadKit.
* **Automated actions**: Use regular-expression rules to delete, star, mark as read, flag as advertising, or mark matching articles as low quality.
* **Multi-user support**: Keep accounts, subscriptions, reading state, preferences, and assistant interactions user-scoped.
* **Optional AI assistant**: Enable natural-language search, summarization, classification, tagging, and feed interactions through the Model Context Protocol (MCP).

## Semantic Architecture

RSSMonster's newer architecture adds a semantic layer between feed crawling and the article list. Rather than storing articles as isolated feed entries, the system enriches them with vectors, scores, cluster membership, topic membership, and engagement signals. Those derived signals are then used by search expressions, Smart Folders, ranking, and the UI.

The semantic pipeline works in stages:

1. **Article enrichment**: crawled articles are normalized, summarized where applicable, scored for quality, and embedded into vectors that capture meaning beyond exact keyword overlap.
2. **Event clustering**: each article is compared with recent candidate events using semantic similarity, headline overlap, named-entity overlap, and time proximity. Strong matches update an existing event; otherwise RSSMonster can create a new event cluster.
3. **Topic grouping**: events are assigned to broader topics using ranked membership. An event can have a primary topic while still retaining secondary topic relationships, which keeps broad storylines stable without forcing every article into a single rigid category.
4. **Signal aggregation**: event size, source diversity, topic density, freshness, quality, uniqueness, trust, and engagement are aggregated into ranking signals. This allows larger corroborated stories to surface without letting repetitive coverage drown out more original work.
5. **Declarative retrieval**: Smart Folders and searches consume supported signals through visible query operators such as `quality:>0.7`, `freshness:>=0.5`, `event:true`, `island:true`, `hot:true`, `tag:security`, and `sort:recommended`.

This design keeps the intelligence of the reader inspectable. RSSMonster does not only decide what to show; it exposes the dimensions behind that decision so you can build views for different reading modes. A morning scan might prefer fresh event clusters with multiple sources, while deeper research might expand the full cluster, inspect related topic groups, and compare how different feeds covered the same story.

Historical semantic rebuilding is available through `npm run semantic:all`. It rebuilds event, topic, and interest-island assignments for existing articles and is intended for explicit repair or migration workflows after large imports, algorithm changes, or embedding updates.

## How Ranking Scores Work (End User)

* **Recommended / importance ranking**: Combines freshness, personal interest, article quality, event coverage, publisher diversity, and cross-source corroboration. Meaningful multi-article events and user-defined rule tags can add small boosts; prioritizing high-trust feeds is an explicit preference. The result favors timely, relevant, well-supported stories while keeping its inputs inspectable.
* **Attention**: Reflects how people interact with an article. A quick skim gives a small boost; reads, deep reads, and highly engaged sessions boost more. Re-opens and outbound clicks add a modest extra lift. No interaction means no attention boost.
* **Quality**: Evaluates tone, writing, and promotional content. Sentiment, writing quality, and advertisement detection combine into a single 0–1 score, which feed-quality evidence can gently adjust.
* **Uniqueness**: Describes how standalone an article is. Articles in larger event clusters receive a lower uniqueness signal, helping the interface identify redundant coverage without removing access to the underlying articles.

## Prerequisites

### Docker Installation

For the recommended Docker deployment:

* Docker Engine or Docker Desktop
* Docker Compose

No separate MySQL installation is required when using the default SQLite deployment.

### Manual / Source Installation

For running RSSMonster directly from source:

* **Node.js**: Version 22.x or higher
* **npm**: Comes bundled with Node.js
* **Git**: For cloning the repository
* **SQLite**: Recommended for simple local and personal installations
* **MySQL**: Optional; recommended for higher-concurrency installations

## Manual Installation

### 1. Clone the Repository

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

### 2. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
cd ..
```

### 3. Configure Environment Variables

Copy the `.env.example` files to `.env`:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### SQLite Configuration

For a simple local installation, configure `server/.env` with:

```env
NODE_ENV=development

DB_DIALECT=sqlite
DB_STORAGE=./data/rssmonster.sqlite
```

RSSMonster creates the SQLite parent data directory when required.

SQLite installations use conservative crawl concurrency settings automatically to reduce write contention.

### MySQL Configuration

To use MySQL instead, configure:

```env
NODE_ENV=development

DB_DIALECT=mysql
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=your_database_password
DB_HOSTNAME=localhost
DB_PORT=3306
```

### Client Configuration

Configure `client/.env`:

```env
VITE_APP_HOSTNAME=http://localhost:3000
VITE_NODE_ENV=development
VITE_ENABLE_AGENT=false
```

Set `VITE_ENABLE_AGENT=true` if you want to enable the optional AI assistant.

### 4. Initialize the Database

Run the canonical database migrations:

```bash
cd server
npm run db
```

The same migration baseline supports both SQLite and MySQL.

If you explicitly need the project seeders:

```bash
./node_modules/.bin/sequelize db:seed:all
```

### Recommended MySQL Configuration for Larger Article Volumes

This section applies only to MySQL installations.

When processing or querying large numbers of articles, increasing MySQL sort memory can reduce sort-related bottlenecks.

Add the following to your MySQL configuration, for example in `my.cnf`:

```ini
[mysqld]
sort_buffer_size = 4M
```

### 5. Set Up Feed Crawling

Run a crawl manually with:

```bash
cd server
DISABLE_LISTENER=true npm run crawl
```

This runs a crawl of active feeds and prints the crawl and semantic-processing results to the console.

Production installations can run the dedicated crawl worker using the process-management approach appropriate to the deployment environment.

## Optional / Recommended Post-Installation Tasks

### Rebuild Historical Semantic Data

If you need to rebuild article clusters from scratch:

```bash
cd server
npm run semantic:all
```

This command rebuilds historical event assignments, topics, interest islands, and interest scores for every user.

Use:

```bash
npm run semantic:all -- --userId=3
```

to limit the rebuild to one user.

**When to use this:**

* after bulk importing articles;
* when cluster quality degrades over time;
* after changing clustering algorithms or parameters;
* to repair cluster assignment inconsistencies.

This is an explicit historical rebuild workflow. Normal post-crawl semantic processing only considers newly created, unfiltered articles.

### Generate Island Taxonomy Vectors

Taxonomy-vector generation is **not required for a normal SQLite installation or Docker Quick Start**.

If you explicitly need to generate or regenerate taxonomy vectors:

```bash
cd server
npm run taxonomy:vectors
npm run seed:island-taxonomy
```

`npm run taxonomy:vectors` requires an OpenAI API key:

```env
OPENAI_API_KEY=your-openai-api-key-here
```

### Calculate Feed Trust Scores

Feed trust scores help identify high-quality sources based on originality, article quality, and user engagement:

```bash
cd server
npm run feedtrust
```

This command calculates trust scores from `0.0` to `1.0` for active feeds using:

* **Originality (35%)**: How often the feed publishes original content versus syndicated articles
* **Quality (25%)**: Average quality score of articles from the feed
* **Engagement (20%)**: User interaction such as favorites and clicks
* **Consistency (20%)**: Placeholder for future enhancements

**When to use this:**

* periodically to update feed rankings;
* after significant changes in reading patterns;
* to identify low-quality or noisy feeds.

The trust score uses an exponential moving average (EMA) to adapt over time while remaining resistant to short-term fluctuations.

## Optional AI Assistant (Model Context Protocol)

RSSMonster can expose an AI-powered assistant for natural-language interactions with your RSS feeds. It is optional and complements the core semantic pipeline rather than replacing event discovery, ranking, topics, or Smart Folders.

Example requests include:

* "Show me technology articles from the last week"
* "What are my favorite articles?"
* "Find unread posts about JavaScript"

![Screenshot](docs/assets/screenshot02.png)

### Configuration

To enable the AI assistant and other agentic features, configure the following environment variables:

**Server (`server/.env`):**

```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL_AGENT=gpt-5.1
OPENAI_MODEL_CRAWL=gpt-4o-mini
```

After configuration, restart the client and server.

The assistant provides:

* natural-language search across articles;
* time-based filtering;
* article summarization;
* classification and tagging;
* favorite and trending article discovery;
* Smart recommendations based on reading interests.

RSSMonster automatically tracks article interactions and can use AI to classify content with three quality metrics:

* **advertisementScore** — promotional or advertising-content detection;
* **sentimentScore** — emotional-tone analysis;
* **qualityScore** — content depth and writing-quality analysis.

These scores provide additional inspectable signals for filtering and ranking.

**Note:** All interactions are user-scoped, ensuring privacy and data isolation in multi-user environments.

**Note for Developers:** The MCP server is available at `/mcp` for programmatic integration. Authentication requires a valid JWT token passed through the `Authorization: Bearer <token>` header. Obtain a token by authenticating through `/api/auth/login`.

## Development

### Running in Development Mode

**Client with hot reload:**

```bash
cd client
npm run dev
```

**Server with hot reload:**

```bash
cd server
npm run dev
```

To attach a debugger:

```bash
npm run debug
```

Node exposes its inspector on port `9229`.

The client will typically run on:

```text
http://localhost:8080
```

and the server on:

```text
http://localhost:3000
```

## Production Deployment

### Docker Deployment

For most self-hosted installations, use the SQLite Docker deployment described in [Docker Quick Start](#docker-quick-start):

```bash
docker compose up -d
```

SQLite is the recommended default for personal installations because it requires no separate database server and keeps persistent application data in a Docker volume.

Update an existing Docker deployment with:

```bash
docker compose pull
docker compose up -d
```

For installations requiring MySQL:

```bash
docker compose -f docker-compose.mysql.yml up -d
```

### Manual Deployment

For environments where RSSMonster runs directly on the host rather than through Docker:

#### 1. Configure the database

SQLite:

```env
NODE_ENV=production
DB_DIALECT=sqlite
DB_STORAGE=/path/to/persistent/rssmonster.sqlite
```

Or MySQL:

```env
NODE_ENV=production
DB_DIALECT=mysql
DB_HOSTNAME=localhost
DB_PORT=3306
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=your_database_password
```

#### 2. Install server dependencies and apply migrations

```bash
cd server
npm ci
npm run db
```

#### 3. Build the client

```bash
cd ../client
npm ci
npm run build
```

#### 4. Copy the client build

```bash
rm -rf ../server/dist
cp -R dist ../server/dist
```

#### 5. Start RSSMonster

```bash
cd ../server
npm run start
```

Use a suitable process manager or service manager for long-running production installations.

## HTTPS Configuration

For production environments, use Let's Encrypt with Certbot for SSL/TLS certificates.

### 1. Obtain Certificate

```bash
certbot certonly --standalone -d yourdomain.com --agree-tos -q
```

### 2. Copy Certificates

For example, create a weekly cron job:

```cron
0 0 * * 0 certbot renew --quiet && cp /etc/letsencrypt/live/yourdomain.com/* /path/to/rssmonster/cert/
```

### 3. Enable HTTPS

Add the following to `server/.env`:

```env
ENABLE_HTTPS=true
```

RSSMonster will use certificates from:

```text
cert/fullchain.pem
cert/privkey.pem
```

Restart the server after updating the configuration.

## Fever API Integration

RSSMonster is compatible with the Fever API, enabling integration with third-party RSS clients.

### Configuration

* **Fever API Endpoint:** `http://your-rssmonster-url/api/fever`
* **Authentication:** Any valid RSSMonster username and password

### Supported Clients

* **Reeder (iOS)**: Configure by adding a Fever account with the endpoint above

![Screenshot Fever](docs/assets/fever.png)

## Google Reader API Integration

RSSMonster supports the Google Reader API, providing compatibility with a wide range of RSS clients.

See the [Google Reader API compatibility matrix](docs/google-reader-api.md) for the exact endpoint contract, authentication examples, client checklist, identifier formats, and unsupported behavior.

### Configuration

* **API Endpoint:** `http://your-rssmonster-url/api/greader`
* **Authentication:** Use your RSSMonster username and password

### Supported Clients

| App                                                                       | Platform  | Notes                        |
| ------------------------------------------------------------------------- | --------- | ---------------------------- |
| [News+](https://github.com/noinnion/newsplus)                             | Android   | With Google Reader extension |
| [FeedMe](https://play.google.com/store/apps/details?id=com.seazon.feedme) | Android   | Full sync support            |
| [Reeder](https://www.reederapp.com/)                                      | iOS/macOS | Classic version              |
| [Vienna RSS](http://www.vienna-rss.com/)                                  | macOS     | Open source                  |
| [ReadKit](https://readkit.app/)                                           | macOS     | Multi-service reader         |

### Supported Operations

* **Authentication:** ClientLogin with username/password
* **Subscriptions:** List, add, edit, remove feeds
* **Tags/Categories:** List, rename, delete categories
* **Articles:** Fetch by stream, feed, or category with pagination
* **Mark as read/unread:** Individual articles or mark all as read
* **Star/unstar:** Favorite articles
* **Unread counts:** Per feed, category, and total

## Contributing

Contributions are welcome.

To contribute:

1. Fork the repository.

2. Create a feature branch:

   ```bash
   git switch -c feature/amazing-feature
   ```

3. Commit your changes:

   ```bash
   git commit -m "Add amazing feature"
   ```

4. Push the branch:

   ```bash
   git push origin feature/amazing-feature
   ```

5. Open a Pull Request.

Please ensure your code follows the existing style and includes appropriate tests.

## Credits

RSSMonster is built with the following frameworks and libraries:

* **[Node.js](https://nodejs.org/)** — JavaScript runtime
* **[Express](https://expressjs.com/)** — Web framework
* **[Vue.js 3](https://vuejs.org/)** — Frontend framework
* **[Bootstrap Icons](https://icons.getbootstrap.com/)** — Icon library
* **[Sequelize](https://sequelize.org/)** — ORM and database abstraction
* **SQLite** — Default database for simple self-hosted installations
* **MySQL** — Supported database for higher-concurrency installations
* **[feedsmith](https://github.com/macieklamberski/feedsmith)** — RSS/Atom feed parsing

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.
