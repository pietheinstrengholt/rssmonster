layout: page
title: Getting Started

Welcome! This guide will walk you through installing and setting up RSSMonster. Choose your preferred method and you'll be up and running in minutes.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js** 20.x or higher
- **npm** (comes bundled with Node.js)
- **MySQL** or MariaDB database
- **Git** for cloning the repository

---

## Quick Start with Docker

The fastest way to get started if you already have a MySQL database:

```bash
docker run -d \
	-p 3000:3000 \
	--add-host=host.docker.internal:host-gateway \
	-e NODE_ENV=production \
	-e DB_HOSTNAME=host.docker.internal \
	-e DB_PORT=3306 \
	-e DB_DATABASE=rssmonster \
	-e DB_USERNAME=rssmonster \
	-e DB_PASSWORD=rssmonster \
	rssmonster/rssmonster
```

Access RSSMonster at `http://localhost:3000`

**Default credentials:** `rssmonster` / `rssmonster` (change these immediately!)

---

## Manual Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

### Step 2: Install Dependencies

RSSMonster has separate client and server components:

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
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
```

**Edit `server/.env`** with your database credentials:

```env
DB_DATABASE=your_database_name
DB_USERNAME=your_database_user
DB_PASSWORD=your_database_password
DB_HOSTNAME=localhost
NODE_ENV=development
```

**Edit `client/.env`** to point to your server:

```env
VITE_APP_HOSTNAME=http://localhost:3000
VITE_NODE_ENV=development
VITE_ENABLE_AGENT=false  # Set to 'true' to enable AI assistant
```

### Step 4: Initialize Database

Run migrations and seed initial data:

```bash
cd server
./node_modules/.bin/sequelize db:migrate
./node_modules/.bin/sequelize db:seed:all
```

This creates the database schema and adds a default admin user.

### Step 5: Start the Application

**Development mode** (with hot reload):

```bash
# Terminal 1: Start the server
cd server
npm run debug

# Terminal 2: Start the client
cd client
npm run dev
```

The client runs on `http://localhost:8080` and the server on `http://localhost:3000`.

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

**Default credentials:**
- Username: `rssmonster`
- Password: `rssmonster`

**⚠️ Change these immediately in production!**

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

**Option B: Automated Crawling (Recommended)**

Add a cron job to crawl every 5 minutes:

```bash
*/5 * * * * curl http://localhost:3000/api/crawl
```

---

## Optional Enhancements

### Enable AI Assistant

Add these to your `server/.env`:

```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL_AGENT=gpt-5.1
OPENAI_MODEL_CRAWL=gpt-4o-mini
```

Then set `VITE_ENABLE_AGENT=true` in `client/.env` and restart both services.

The AI assistant enables:
- Natural language search: *"Show me tech articles from last week"*
- Article summarization and tagging
- Smart recommendations based on reading habits

[Learn more about the AI Assistant →](ai-assistant.md)

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

### Update Environment Variables

**Client (`client/.env`):**
```env
VITE_APP_HOSTNAME=https://your-production-domain.com
VITE_NODE_ENV=production
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

- Verify MySQL is running: `mysql -u root -p`
- Check credentials in `server/.env`
- Ensure database exists: `CREATE DATABASE rssmonster;`

### Port Already in Use

Change the port in your server configuration or kill the process using it:

```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Feeds Not Updating

- Check if the crawl cron job is running
- Manually run `npm run crawl` to test
- Check server logs for errors

### AI Assistant Not Working

- Verify `OPENAI_API_KEY` is set correctly
- Check API quota/billing in your OpenAI account
- Ensure both server and client are restarted after config changes

---

## Next Steps

Now that RSSMonster is running, explore these guides:

- **[Create Smart Folders](smart-folders.md)** — Build dynamic views of your content
- **[Master Search](search.md)** — Learn powerful search expressions
- **[Understand Scoring](scoring.md)** — How articles are ranked
- **[Set Up Automation](automation.md)** — Create rules for automatic actions
- **[Connect RSS Clients](api.md)** — Use Fever or Google Reader APIs

---

**Questions?** Check the [documentation index](index.md) or [open an issue](https://github.com/pietheinstrengholt/rssmonster/issues) on GitHub.
