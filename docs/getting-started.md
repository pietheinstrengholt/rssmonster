---
layout: page
title: Getting Started
nav_order: 2
---

Welcome! This guide will walk you through installing and setting up RSSMonster. Choose your preferred method and you'll be up and running in minutes.

For a complete reference to database, crawler, security, AI, and client
settings, see the [configuration guide](configuration.md).

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js** 22.x or higher
- **npm** (comes bundled with Node.js)
- **Git** for cloning the repository

For the recommended Docker installation, you only need Docker Engine or Docker
Desktop with Docker Compose. The default deployment uses SQLite, so it does not
require a separate database or model service. The comprehensive profile adds
MySQL and local inference for larger or higher-concurrency installations.

---

## Quick Start with Docker

The default Compose configuration is designed for quickly seeing RSSMonster in
live action. It runs the web application and a dedicated crawl worker, uses
SQLite, and stores the database in a persistent Docker volume.

### 1. Clone RSSMonster

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

### 2. Configure Application Secrets

Create a `.env` file in the repository root:

```env
JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-different-long-random-secret
```

Generate secure values by running this command twice and using a different
value for each secret:

```bash
openssl rand -hex 32
```

### 3. Start RSSMonster

```bash
docker compose up -d
```

On first startup, RSSMonster creates and initializes the SQLite database and
starts one dedicated crawl worker automatically.
Inference-backed classifications, embeddings, the assistant, AI feed repair,
and Smart Folder recommendations are disabled in this quick-start deployment,
so no inference service is required.
Open `http://localhost:3000` and create your first account.

Check the deployment or follow its logs with:

```bash
docker compose ps
docker compose logs -f rssmonster rssmonster-worker
```

### Updating RSSMonster

```bash
docker compose pull
docker compose up -d
```

Pending migrations are applied automatically when the new container starts.

### SQLite Data Persistence

The default Compose configuration mounts a persistent Docker volume at
`/app/data`. It can contain `rssmonster.sqlite` and its `-wal` and `-shm`
companion files.

Stop RSSMonster without deleting its data with:

```bash
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete the
database volume.

### Comprehensive MySQL Deployment

The comprehensive profile is intended for deployments with multiple active
users, higher write concurrency, or local intelligent-content processing. It
starts RSSMonster, a dedicated crawl worker, `rssmonster-ai-worker`, MySQL 8.4,
and an inference service
configured with:

- Qwen3 Embedding for semantic vectors;
- Qwen3.5 for classification text generation, Smart Folder recommendations,
  and feed rediscovery; and
- ModernBERT for local article scoring.

These local features require no OpenAI API key. The optional natural-language
assistant remains hidden unless `INFERENCE_ASSISTANT_ENABLED=true` is set after
configuring `ASSISTANT_PROVIDER=openai` and `OPENAI_API_KEY`, because its
current inference adapter is OpenAI-only.

Add the required credentials to the root `.env` file alongside the application
secrets:

```env
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=replace-with-a-strong-database-password
MYSQL_ROOT_PASSWORD=replace-with-a-strong-root-password
JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-different-long-random-secret
```

Then use the separate MySQL Compose configuration:

```bash
docker compose -f docker-compose.mysql.yml up -d --build
```

On first startup, the inference service downloads its models into the persistent
`inference-model-cache` volume. RSSMonster and both workers wait for MySQL and
inference to become healthy before starting. MySQL data is stored in the
`mysql-data` volume.

Check the complete deployment or follow its startup logs with:

```bash
docker compose -f docker-compose.mysql.yml ps
docker compose -f docker-compose.mysql.yml logs -f inference rssmonster rssmonster-worker rssmonster-ai-worker
```

Both Docker profiles monitor the crawl worker independently. The MySQL profile
also monitors `rssmonster-ai-worker` independently. By default, three
consecutive failures or 15 minutes without a state update mark the relevant
worker unhealthy. See the [configuration guide](configuration.md) to tune these
thresholds.

---

## Manual Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

### Step 2: Install Dependencies

RSSMonster has separate client, server, and inference components:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Install inference dependencies
cd ../inference
npm install
cd ..
```

### Step 3: Configure Environment

Copy the example environment files:

```bash
# Server configuration
cp server/.env.example server/.env

# Client configuration
cp client/.env.example client/.env

# Inference configuration
cp inference/.env.example inference/.env
```

For a simple local installation, configure SQLite in `server/.env`:

```env
NODE_ENV=development
DB_DIALECT=sqlite
DB_STORAGE=./data/rssmonster.sqlite
```

RSSMonster creates the parent data directory when required and automatically
uses conservative crawl concurrency settings with SQLite to reduce write
contention.

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

**Edit `client/.env`** to point to your server:

```env
VITE_APP_HOSTNAME=http://localhost:3000
```

### Step 4: Initialize Database

Run the canonical database migrations. The same migration baseline supports
SQLite and MySQL:

```bash
cd server
npm run db
```

Project seeders are optional. If you explicitly need them, run:

```bash
./node_modules/.bin/sequelize db:seed:all
```

### Step 5: Start the Application

**Development mode** (with hot reload):

```bash
# Terminal 1: Start inference
cd inference
npm run dev

# Terminal 2: Start the server
cd server
npm run dev

# Terminal 3: Start the client
cd client
npm run dev
```

Inference listens on `http://127.0.0.1:3001`, the server on
`http://localhost:3000`, and the client on `http://localhost:8080`.

**Production mode:**

```bash
# Build the client
cd client
npm run build

# Move built files to server
mv dist ../server/

# Start the server
cd ../server
npm run start
```

---

## First Steps After Installation

### 1. Log In

Navigate to `http://localhost:8080` (development) or `http://localhost:3000` (production).
Create your first account if you have not already done so, then log in with
those credentials. See [First Login](first-login.md) for the registration flow
and the optional development-login configuration.

### 2. Add Your First Feed

Click **"Add Feed"** and paste an RSS feed URL. RSSMonster will:
- Validate the feed
- Extract metadata (name, description, favicon)
- Let you assign it to a category

### 3. Import from OPML (Optional)

If you're migrating from another RSS reader:
1. Export your feeds as OPML from your old reader
2. Go to **Settings → Import OPML**
3. Upload the file

### 4. Set Up Feed Crawling

Choose one of these methods to keep your feeds updated:

**Option A: Manual Crawling**

Run this command whenever you want to fetch new articles:

```bash
cd server
DISABLE_LISTENER=true npm run crawl
```

**Option B: Dedicated Crawl Worker (Recommended)**

Set the polling interval in `server/.env`, then start both production processes
from the repository root:

```env
CRAWL_WORKER_INTERVAL_MS=60000
```

```bash
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
```

Disable any existing OS cron entry that calls `/api/crawl`; leaving it enabled
will trigger duplicate scheduled crawls alongside the worker.

---

## Optional Enhancements

### Enable AI Assistant

Enable the capability in `server/.env`:

```env
INFERENCE_AI_ENABLED=true
INFERENCE_ASSISTANT_ENABLED=true
INFERENCE_AGENT_TIMEOUT_MS=300000
```

Put `OPENAI_API_KEY`, `ASSISTANT_PROVIDER`, and `ASSISTANT_MODEL` in
`inference/.env`; see [Model Usage](model-usage.md). Keep
`INFERENCE_ASSISTANT_ENABLED` only in `server/.env`. Restart inference and the
server. The client shows chat when the server reports the enabled capability.

The AI assistant enables:
- Natural language search: *"Show me tech articles from last week"*
- Article summarization and tagging
- Smart recommendations based on reading habits

[Learn more about AI configuration →](configuration.md#inference-and-openai-features)

### Calculate Feed Trust Scores

Run this periodically (weekly recommended) to update feed rankings:

```bash
cd server
npm run feedtrust
```

This analyzes your feeds based on:
- **Originality** — how often they publish unique content
- **Quality** — average article scores
- **Engagement** — what you actually read and star

[Learn more about scoring →](scoring.md)

### Rebuild Article Clusters

If you've enabled semantic search or bulk-imported articles:

```bash
cd server
npm run recluster
```

This groups similar articles together to reduce duplicate coverage.

---

## Production Deployment

Use `docker compose up -d` for the quick SQLite profile. For the comprehensive
MySQL and local-inference profile, use
`docker compose -f docker-compose.mysql.yml up -d --build`.

### Update Environment Variables

**Client (`client/.env`):**
```env
VITE_APP_HOSTNAME=https://your-production-domain.com
```

**Server (`server/.env`):**
```env
NODE_ENV=production
```

### Enable HTTPS

For production, use Let's Encrypt:

```bash
# Get certificate
certbot certonly --standalone -d yourdomain.com --agree-tos -q

# Add to server/.env
ENABLE_HTTPS=true

# Place certificates in server/cert/
# - fullchain.pem
# - privkey.pem
```

Set up a weekly cron to renew:

```bash
0 0 * * 0 certbot renew --quiet && cp /etc/letsencrypt/live/yourdomain.com/* /path/to/rssmonster/server/cert/
```

---

## Troubleshooting

### Database Connection Errors

- For SQLite, verify that the configured data directory is writable and that
  the persistent Docker volume has not been removed.
- For MySQL, check `docker compose -f docker-compose.mysql.yml ps`, verify the
  credentials in `.env`, and inspect the MySQL and RSSMonster container logs.

### Port Already in Use

Change the port in your server configuration or kill the process using it:

```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Feeds Not Updating

- For Docker, check `docker compose ps rssmonster-worker` and
  `docker compose logs rssmonster-worker`. An `unhealthy` worker has either
  exceeded the configured consecutive-failure limit or stopped updating its
  health state.
- For a manual installation, check whether `rssmonster-worker` is running in
  PM2.
- Manually run `npm run crawl` to test
- Check server logs for errors

### AI Assistant Not Working

- Verify `OPENAI_API_KEY` is set in `inference/.env`
- Check `pm2 status rssmonster-inference` and its logs
- Check API quota/billing in your OpenAI account
- Ensure inference, the server, and the client are restarted after config changes

### Background AI Processing Is Stalled

- With MySQL Compose, check
  `docker compose -f docker-compose.mysql.yml ps rssmonster-ai-worker` and its
  logs. With SQLite Compose, background jobs remain in `rssmonster-worker`.
- For PM2, check `pm2 status rssmonster-ai-worker` and
  `pm2 logs rssmonster-ai-worker`.
- Confirm the processing-job and worker-lease migrations have been applied and
  that the AI worker can reach both the database and inference service.

---

## Next Steps

Now that RSSMonster is running, explore these guides:

- **[Create Smart Folders](smart-folders.md)** — Build dynamic views of your content
- **[Master Search](search.md)** — Learn powerful search expressions
- **[Understand Scoring](scoring.md)** — How articles are ranked
- **[Set Up Rule-Based Tags](tag.md#rule-based-tags)** — Create tags automatically with rules
- **[Connect RSS Clients](api.md)** — Use Fever or Google Reader APIs

---

**Questions?** Check the [documentation index](index.md) or [open an issue](https://github.com/pietheinstrengholt/rssmonster/issues) on GitHub.
