---
layout: page
title: Getting Started
nav_order: 2
has_children: true
---

For a local app with manual feed refresh, see
[RSSMonster Desktop]({% link desktop.md %}). It runs the reader and SQLite on your
computer without Docker or a separate server.

For self-hosting, choose the SQLite profile for lightweight personal reading, or the MySQL profile
for local inference and background analysis. First-time model downloads can take
several minutes; later starts reuse the cache.

For a complete reference to database, crawler, security, AI, and client
settings, see the [configuration guide]({% link configuration.md %}).

---

## Prerequisites

For a manual/source installation, make sure you have:

- **Node.js** 24 for the source installation guides
- **npm** (comes bundled with Node.js)
- **Git** for cloning the repository

For the recommended Docker installation, use Git to clone the repository and
Docker Engine or Docker Desktop with Docker Compose. The default deployment uses SQLite, so it does not
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

```bash
touch .env
chmod 600 .env
```

This restricts the file to the account that owns it. Then add the required
secrets:

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
The port is bound to host loopback by default. To make a direct, non-proxied
installation reachable from other machines, set
`RSSMONSTER_BIND_ADDRESS=0.0.0.0` and keep `TRUST_PROXY=false`. For reverse-proxy
deployments, keep the loopback binding and follow the
[proxy and network security guidance]({% link configuration.md %}#proxy-and-network-security).

Check the deployment or follow its logs with:

```bash
docker compose ps
docker compose logs -f rssmonster rssmonster-worker
```

### Updating RSSMonster

The quick start uses the moving `latest` tag. For an unattended production
deployment, first pin a published source-revision tag or image digest in the
root `.env`; see [Pinning the Docker image]({% link configuration.md %}#pinning-the-docker-image).
Change that pin deliberately when you are ready to update. Then run:

```bash
docker compose pull
docker compose up -d
```

Pending migrations are applied automatically when the new container starts.
Back up the database and stable configuration secrets before changing a
production image pin. See [Backup and Restore]({% link backup-restore.md %}) for the SQLite
and MySQL procedures.

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

- Qwen3 Embedding for 1024-dimensional semantic vectors;
- Qwen3.5 for classification text generation, Smart Folder recommendations,
  and feed rediscovery; and
- ModernBERT for local article scoring.

These local features require no OpenAI API key. The optional natural-language
assistant remains hidden unless `INFERENCE_ASSISTANT_ENABLED=true` is set after
configuring `ASSISTANT_PROVIDER=openai-compatible`, `ASSISTANT_BASE_URL`,
`ASSISTANT_API_KEY`, and a tool-capable `ASSISTANT_MODEL`.

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
docker compose -f docker-compose.mysql.yml up -d --pull always
```

The application and inference images are pulled from Docker Hub, so image
updaters such as Watchtower can keep the complete deployment current without a
local source checkout or build. On first startup, the inference service downloads its models into the persistent
`inference-model-cache` volume. RSSMonster and both workers wait for MySQL and
inference to become healthy before starting. MySQL data is stored in the
`mysql-data` volume. Downloads can take several minutes depending on the host
and network; later starts reuse the downloaded models. See [Inference]({% link inference.md %})
for readiness diagnostics and [Backup and Restore]({% link backup-restore.md %}) before upgrades.

Check the complete deployment or follow its startup logs with:

```bash
docker compose -f docker-compose.mysql.yml ps
docker compose -f docker-compose.mysql.yml logs -f inference rssmonster rssmonster-worker rssmonster-ai-worker
```

Both Docker profiles monitor the crawl worker independently. The MySQL profile
also monitors `rssmonster-ai-worker` independently. By default, three
consecutive failures or 15 minutes without a state update mark the relevant
worker unhealthy. See the [configuration guide]({% link configuration.md %}) to tune these
thresholds.

---

## Manual Installation

For platform-specific steps, follow [macOS Installation]({% link osx-installation.md %})
or [Ubuntu Installation]({% link ubuntu-installation.md %}). Both guides use Node.js 24.

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

Set distinct, stable `JWT_SECRET` and `FEVER_CREDENTIAL_SECRET` values in
`server/.env`; generate them as described in the Docker secrets step above.
Keep secret-bearing files private and out of Git.

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

For optional inference, configure the server capability flags and select providers
using [Model Usage]({% link model-usage.md %}#server-configuration). Core reading does not
require inference. Local Qwen/ModernBERT processing needs no OpenAI key; the
optional assistant has separate requirements in [Assistant and MCP]({% link assistant.md %}).

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
# Terminal 1: Start inference, if configured
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

For debugger setup, optional workers, tests, and the contribution workflow, see
[Contributing]({% link contributing.md %}). For a host deployment, follow
[Manual production deployment](#manual-production-deployment).

---

## First Steps After Installation

### 1. Log In

Navigate to `http://localhost:8080` (development) or `http://localhost:3000` (production).
Create your first account if you have not already done so, then log in with
those credentials. See [First Login]({% link first-login.md %}) for the registration flow
and the optional development-login configuration.

### 2. Add Your First Feed

Click **"Add Feed"** and paste an RSS feed URL. RSSMonster will:
- Validate the feed
- Extract metadata (name, description, favicon)
- Let you assign it to a category

### 3. Import from OPML (Optional)

If you're migrating from another RSS reader:
1. Export your feeds as OPML from your old reader
2. Go to **Settings → Feeds** and choose **Import OPML**
3. Upload the file
4. Review the categories and subscriptions found in the file
5. Approve the preview to create the subscriptions, or discard it without making changes

See [OPML Import and Export]({% link opml.md %}) for preview statuses, duplicate handling,
category editing, and export details.

### 4. Set Up Feed Crawling

Choose one of these methods to keep your feeds updated:

**Option A: Manual Crawling**

Run this command whenever you want to fetch new articles:

```bash
cd server
npm run crawl
```

**Option B: Dedicated Crawl Worker (Recommended)**

Set the polling interval in `server/.env`, then start the configured production processes
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

Follow [Assistant and MCP]({% link assistant.md %}) for the complete server and inference
configuration. Chat is optional and does not itself run background article
analysis or semantic jobs.

### Calculate Feed Trust Scores

Recalculate after significant changes in reading patterns or when reviewing
source value. From the repository root:

```bash
cd server
npm run feedtrust
```

This analyzes your feeds based on:
- **Article quality** — average usable article-quality scores
- **Engagement** — supporting evidence from meaningfully exposed articles
- **Originality** — actual duplicate relationships, not shared Event coverage
- **Negative feedback** — explicit negative actions among exposed articles

[Learn how FeedTrust works →]({% link feedtrust.md %})

### Maintain semantic organization

Normal enabled crawls run embedding, event, topic, and island processing in
order. Historical rebuilds are maintenance operations, not an installation step.
Back up the database and read [Server Jobs]({% link server-jobs.md %}) before selecting an
incremental, repair, or full rebuild command. There is no `npm run recluster`
script; use the documented commands appropriate to the intended operation.

---

## Production Deployment

For Docker, follow the profile-specific startup instructions above and the
[image pinning]({% link configuration.md %}#pinning-the-docker-image),
[reverse proxy]({% link configuration.md %}#proxy-and-network-security), and
[backup]({% link backup-restore.md %}) guides before exposing or upgrading the service.

### Manual production deployment

Complete the source configuration above. Set `NODE_ENV=production`, stable
application secrets, and your database connection in `server/.env`. For SQLite,
use an absolute persistent path such as
`DB_STORAGE=/var/lib/rssmonster/rssmonster.sqlite`; for MySQL, use the
[documented connection settings]({% link configuration.md %}#mysql).

Set `VITE_APP_HOSTNAME=https://your-production-domain.com` in `client/.env`
before building. Client environment changes require a rebuild.

From the repository root, install the locked dependencies and apply migrations
only after backing up any existing database:

```bash
cd server
npm ci
npm run db
cd ../client
npm ci
npm run build
```

Replace only the previous client build, then copy the new build into the server:

```bash
# Run from client; server/dist contains generated frontend assets.
rm -rf ../server/dist
cp -R dist ../server/dist
cd ../server
npm start
```

Use a service manager for long-running production processes. The web process
alone does not schedule crawling or consume optional analysis jobs. Follow
[Crawling]({% link crawling.md %}) for worker supervision and
[Inference]({% link inference.md %}#pm2-production-setup) for the supplied four-process
PM2 topology and model service. Keep inference on a private network.

### Enable HTTPS

Configure TLS at your reverse proxy using the
[proxy guidance]({% link configuration.md %}#proxy-and-network-security), or follow
[direct HTTPS and Certbot setup]({% link configuration.md %}#direct-https-and-certbot)
when the Node server terminates TLS itself.

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

- Verify the selected remote capability has its `*_API_KEY` and `*_BASE_URL` set in `inference/.env`
- Check `pm2 status rssmonster-inference` and its logs
- Check API quota/billing in your OpenAI account
- Ensure inference, the server, and the client are restarted after config changes

### Background AI Processing Is Stalled

- With MySQL Compose, check
  `docker compose -f docker-compose.mysql.yml ps rssmonster-ai-worker` and its
  logs. The lightweight SQLite Compose profile does not run background AI
  processing.
- For PM2, check `pm2 status rssmonster-ai-worker` and
  `pm2 logs rssmonster-ai-worker`.
- Confirm the processing-job and worker-lease migrations have been applied and
  that the AI worker can reach both the database and inference service.

---

## Next Steps

Now that RSSMonster is running, explore these guides:

- **[Create Smart Folders]({% link smart-folders.md %})** — Build dynamic views of your content
- **[Master Search]({% link search.md %})** — Learn powerful search expressions
- **[Understand Scoring]({% link scoring.md %})** — How articles are ranked
- **[Set Up Rule-Based Tags]({% link tag.md %}#rule-based-tags)** — Create tags automatically with rules
- **[Connect RSS Clients]({% link api.md %})** — Use Fever or Google Reader APIs

---

**Questions?** Check the [documentation index]({% link index.md %}) or [open an issue](https://github.com/pietheinstrengholt/rssmonster/issues) on GitHub.

## Optional inference on every deployment

MySQL, SQLite, and Desktop can connect to a standalone RSSMonster inference service.
Use `INFERENCE_BASE_URL` and an optional matching `INFERENCE_API_KEY`, or configure
Settings → AI / Inference as an administrator. Environment URLs take precedence and
hide editable controls while keeping discovered capability status visible. Leaving
both environment and saved endpoints unset keeps inference optional. Provider/model
configuration remains inside inference. See [Inference]({% link inference.md %}) for
setup, encryption, upgrades, and SQLite/Desktop worker limitations.
