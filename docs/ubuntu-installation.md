---
layout: page
title: Ubuntu Installation
parent: Getting Started
nav_order: 3.1
---

# RSSMonster Ubuntu Installation

This guide installs RSSMonster from source on Ubuntu with Node.js 24, MySQL,
and PM2. It assumes a fresh installation, Bash, and a regular user account
with `sudo` access. Run the steps as that user, using `sudo` only where shown.

The initial setup provides the web reader and scheduled feed crawling. Local
inference and AI processing can be added after the reader is running.

## 1. Install System Dependencies

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 openssl mysql-server
```

Enable MySQL at boot and start it now:

```bash
sudo systemctl enable --now mysql
sudo systemctl status mysql --no-pager
```

Run the MySQL security setup and follow its prompts:

```bash
sudo mysql_secure_installation
```

Ubuntu normally authenticates the local MySQL root account through the system
socket, so `sudo mysql -u root` does not need a MySQL root password. See
[Ubuntu's MySQL guide](https://ubuntu.com/server/docs/databases-mysql/) for details.

## 2. Create the Database and User

Open the MySQL console:

```bash
sudo mysql -u root
```

Run the following SQL, replacing the password placeholder with a strong password
that meets any password policy selected during security setup:

```sql
CREATE DATABASE rssmonster CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rssmonster'@'localhost' IDENTIFIED BY 'replace-with-a-strong-database-password';
GRANT ALL PRIVILEGES ON rssmonster.* TO 'rssmonster'@'localhost';
EXIT;
```

Test the application account over TCP, entering the password when prompted:

```bash
mysql --protocol=TCP -h localhost -u rssmonster -p rssmonster
```

Exit the console with `EXIT;`. Save the password for the server configuration below.

## 3. Install Node.js 24 with nvm

Install [nvm](https://github.com/nvm-sh/nvm/tree/v0.40.3) for your user account:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE="$HOME/.bashrc" bash
source ~/.bashrc
nvm install 24
nvm alias default 24
nvm use 24
```

Verify the installation:

```bash
node --version
npm --version
```

Node should report `v24.x.x`. npm is included. This guide uses nvm to manage
Node.js; no NodeSource setup is needed. Install npm packages as your regular
user, including global packages such as PM2.

## 4. Clone RSSMonster

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

The remaining steps use `~/Projects/rssmonster`. Adjust the paths if you clone
into another directory.

## 5. Install Application Dependencies

Install the versions recorded in the repository's lockfiles:

```bash
cd ~/Projects/rssmonster/server
npm ci
cd ../client
npm ci
cd ..
```

Create the environment files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
chmod 600 server/.env
```

## 6. Configure RSSMonster

Edit `server/.env` and set the following values. Use the database password from
step 2:

```env
NODE_ENV=production
DB_DIALECT=mysql
DB_HOSTNAME=localhost
DB_PORT=3306
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=replace-with-a-strong-database-password

JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-different-long-random-secret

INFERENCE_AI_ENABLED=false
INFERENCE_ASSISTANT_ENABLED=false
SKIP_ARTICLE_CLASSIFICATION_ANALYSIS=true
SKIP_ARTICLE_EMBEDDINGS=true
SKIP_SEMANTIC_LABELING=true

ENABLE_HTTPS=false
TRUST_PROXY=false
```

Generate two different application secrets by running this command twice, then
paste one value into `JWT_SECRET` and the other into `FEVER_CREDENTIAL_SECRET`:

```bash
openssl rand -hex 32
```

Keep these secrets stable across restarts and keep `server/.env` out of Git.
Quote the database password in the environment file if it contains `#` so it
is not interpreted as a comment.

For access from a browser on the Ubuntu machine, keep these settings in
`client/.env`:

```env
VITE_APP_HOSTNAME=http://localhost:3000
VITE_BASE_URL="/"
```

For access through a domain, set `VITE_APP_HOSTNAME` to the browser-facing URL,
such as `https://rss.example.com`, before building. Follow the
[reverse proxy and HTTPS guidance]({% link configuration.md %}#proxy-and-network-security)
before exposing the service. The source server listens on all interfaces by
default; restrict access to port 3000 with the host or cloud firewall as appropriate.

## 7. Initialize the Database

```bash
cd ~/Projects/rssmonster/server
npm run db
```

This applies the Sequelize migrations. If authentication fails, repeat the
MySQL connection test from step 2 and compare its credentials with `server/.env`.
For an existing installation, [back up the database]({% link backup-restore.md %})
before applying migrations.

## 8. Build the Web Client

```bash
cd ~/Projects/rssmonster/client
npm run build
cp -R dist ../server/dist
cd ..
```

On this fresh installation, the copy creates `server/dist`, which the backend
serves directly. For subsequent builds, follow the build replacement commands
in [manual production deployment]({% link getting-started.md %}#manual-production-deployment).
Changes to `client/.env` require rebuilding and replacing these assets.

## 9. Start RSSMonster with PM2

Install PM2 using your nvm-managed Node.js:

```bash
npm install -g pm2
cd ~/Projects/rssmonster
pm2 start ecosystem.config.cjs --only rssmonster-web,rssmonster-worker --env production
pm2 status
```

The supplied configuration starts the web application through `server/bootstrap.js`
and runs the dedicated crawl worker. Both processes should show `online`.

Open [http://localhost:3000](http://localhost:3000) on the Ubuntu machine, or
your configured domain. Create your first account, then add feeds or import an
OPML file. The first account becomes the administrator; see
[First Login]({% link first-login.md %}).

Inspect startup or crawl errors with:

```bash
pm2 logs rssmonster-web --lines 50
pm2 logs rssmonster-worker --lines 50
```

Each log command follows output until you press `Ctrl+C`; this leaves the
application running.

## 10. Start Automatically After Reboot

Save the process list and generate the systemd startup command for your account:

```bash
pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME"
```

PM2 prints a command beginning with `sudo env PATH=...`. Run that exact command
to register the startup service with the correct nvm Node.js path. See
[PM2 startup documentation](https://pm2.keymetrics.io/docs/usage/startup/).

Verify the service:

```bash
systemctl status "pm2-$(whoami)" --no-pager
```

After changing the Node.js installation, regenerate the PM2 startup service
using `pm2 unstartup` followed by the startup command above, running the commands
PM2 prints. Save the process list again with `pm2 save`.

## Optional: Enable Local Inference and AI Processing

Install and configure the inference service using the
[inference guide]({% link inference.md %}#pm2-production-setup) and
[model usage guide]({% link model-usage.md %}). These cover dependencies, model
downloads, readiness checks, server capability flags, and the full four-process
PM2 configuration, including `rssmonster-ai-worker`.

Enable the corresponding flags in `server/.env` after configuring inference.
Local model processing needs no OpenAI API key. The optional assistant requires
separate configuration, with provider credentials in `inference/.env`.

## Optional: Development Mode

For frontend and backend development, stop the PM2 processes first:

```bash
pm2 stop rssmonster-web rssmonster-worker
```

Set `NODE_ENV=development` in `server/.env` and use
`VITE_APP_HOSTNAME=http://localhost:3000` in `client/.env`. Then run the following
in separate terminals:

```bash
# Terminal 1: backend
cd ~/Projects/rssmonster/server
npm run dev
```

```bash
# Terminal 2: frontend
cd ~/Projects/rssmonster/client
npm run dev
```

Open [http://localhost:8080](http://localhost:8080). See
[Contributing]({% link contributing.md %}) for development workers and tests.
