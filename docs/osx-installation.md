# RSSMonster macOS Installation

This guide describes how to install RSSMonster locally on macOS for development.

It assumes a fresh Mac and installs:

* Apple Command Line Tools
* Homebrew
* Git
* Node.js 22
* npm
* MySQL 8.4
* RSSMonster client dependencies
* RSSMonster server dependencies
* Local MySQL database and user

The instructions below are primarily written for Apple Silicon Macs.

## 1. Install Apple Command Line Tools

Open Terminal and run:

```bash
xcode-select --install
```

Follow the installation dialog.

You can verify the installation with:

```bash
xcode-select -p
```

## 2. Install Homebrew

Install Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

On Apple Silicon, add Homebrew to your shell environment:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Verify the installation:

```bash
brew --version
brew doctor
```

## 3. Install Git

Install Git through Homebrew:

```bash
brew install git
```

Verify:

```bash
git --version
```

Optionally configure your Git identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

## 4. Install Node.js 22

RSSMonster uses Node.js 22.

Install the versioned Homebrew package:

```bash
brew install node@22
```

Add it to your shell path:

```bash
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify Node.js and npm:

```bash
node --version
npm --version
```

The Node.js version should report `v22.x.x`.

npm is included with Node.js and does not need to be installed separately.

## 5. Install MySQL 8.4

Install MySQL 8.4:

```bash
brew install mysql@8.4
```

Add MySQL to your shell path:

```bash
echo 'export PATH="/opt/homebrew/opt/mysql@8.4/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Start MySQL:

```bash
brew services start mysql@8.4
```

Verify:

```bash
mysql --version
brew services list
```

## 6. Secure MySQL

Run:

```bash
mysql_secure_installation
```

For a local development environment, reasonable choices are:

* Set a root password
* Remove anonymous users
* Disable remote root login
* Remove the test database
* Reload privilege tables

Afterwards, log in as root:

```bash
mysql -u root -p
```

## 7. Create the RSSMonster Database

From the MySQL prompt, create the RSSMonster database:

```sql
CREATE DATABASE rssmonster;
```

Create a local RSSMonster database user:

```sql
CREATE USER 'rssmonster'@'localhost'
IDENTIFIED BY 'rssmonster';
```

Grant access:

```sql
GRANT ALL PRIVILEGES ON rssmonster.*
TO 'rssmonster'@'localhost'
WITH GRANT OPTION;
```

Reload privileges:

```sql
FLUSH PRIVILEGES;
```

Exit MySQL:

```sql
exit;
```

Verify that the RSSMonster user can connect:

```bash
mysql -u rssmonster -p -h localhost rssmonster
```

Enter the password:

```text
rssmonster
```

You should now enter the MySQL prompt successfully.

> The password `rssmonster` is convenient for a local development environment. Use a stronger password for any non-local or production installation.

## 8. Clone RSSMonster

Choose a directory for your projects:

```bash
mkdir -p ~/Projects
cd ~/Projects
```

Clone RSSMonster:

```bash
git clone https://github.com/pietheinstrengholt/rssmonster.git
cd rssmonster
```

Verify the repository:

```bash
git status
git remote -v
```

## 9. Install Client Dependencies

Enter the client directory:

```bash
cd client
```

Install dependencies:

```bash
npm install
```

Alternatively, when the existing `package-lock.json` should be followed exactly:

```bash
npm ci
```

Create the local client environment configuration:

```bash
cp .env.example .env
```

Return to the repository root:

```bash
cd ..
```

## 10. Install Server Dependencies

Enter the server directory:

```bash
cd server
```

Install dependencies:

```bash
npm install
```

Or:

```bash
npm ci
```

Create the server environment configuration:

```bash
cp .env.example .env
```

## 11. Configure the Server Environment

Open:

```text
server/.env
```

For a standard local MySQL installation, configure:

```env
NODE_ENV=development

DB_HOSTNAME=localhost
DB_PORT=3306
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=rssmonster

FEED_MAX_COUNT=10
CRAWL_RUN_HEARTBEAT_INTERVAL_MS=30000
CRAWL_RUN_STALE_AFTER_MS=120000

JWT_EXPIRES_IN=604800
JWT_SECRET=replace-with-a-long-random-secret
FEVER_CREDENTIAL_SECRET=replace-with-a-different-long-random-secret

API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=600

MCP_RATE_LIMIT_WINDOW_MS=900000
MCP_RATE_LIMIT_MAX=100

INFERENCE_AI_ENABLED=true
INFERENCE_ASSISTANT_ENABLED=true
INFERENCE_AGENT_TIMEOUT_MS=300000

ENABLE_HTTPS=false
EVENT_RECLUSTER_DEBUG=false

# Space-separated host[:port] or CIDR exceptions for trusted internal feeds.
RSSMONSTER_INTERNAL_HOST_ALLOWLIST=
```

The important MySQL settings are:

```env
DB_HOSTNAME=localhost
DB_PORT=3306
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=rssmonster
```

Make sure these values match the database and MySQL account created earlier.

Install and configure the separate inference service from the repository root:

```bash
cd ../inference
npm install
cp .env.example .env
```

Put `OPENAI_API_KEY`, `ASSISTANT_PROVIDER`, and `ASSISTANT_MODEL` in
`inference/.env`. Provider credentials never belong in `server/.env`. Then
return with `cd ../server` before running the database commands below.

## 12. Test the Database Connection

Before running migrations, test MySQL directly:

```bash
mysql -u rssmonster -p -h localhost rssmonster
```

If this works, the database, username, password, and hostname are valid.

Exit MySQL again:

```sql
exit;
```

## 13. Run the Database Migrations

From the `server` directory:

```bash
npm run db
```

This runs the Sequelize migrations:

```text
sequelize db:migrate
```

A successful migration should show Sequelize applying the RSSMonster database migrations without authentication errors.

If you receive:

```text
Access denied for user 'rssmonster'@'localhost'
```

first verify that this command works:

```bash
mysql -u rssmonster -p -h localhost rssmonster
```

Then check that `server/.env` contains the same credentials:

```env
DB_HOSTNAME=localhost
DB_DATABASE=rssmonster
DB_USERNAME=rssmonster
DB_PASSWORD=rssmonster
```

## 14. Start the Inference Service

Open a Terminal window and start inference from the repository:

```bash
cd ~/Projects/rssmonster/inference
npm run dev
```

Wait until the service reports that configured on-device models are loaded and
that it is listening on `http://127.0.0.1:3001`. Keep this process running
before starting a crawl or using AI-backed features.

## 15. Start the RSSMonster Server

From:

```bash
cd server
```

Check the available npm commands:

```bash
npm run
```

Start the development server using the appropriate development script defined in `server/package.json`.

For example:

```bash
npm run dev
```

## 16. Start the RSSMonster Client

Open another Terminal window:

```bash
cd ~/Projects/rssmonster/client
```

Start the Vue development server:

```bash
npm run dev
```

Vite will print the local URL to open in your browser.

Typically this resembles:

```text
http://localhost:5173
```

## 17. Useful MySQL Commands

Start MySQL:

```bash
brew services start mysql@8.4
```

Stop MySQL:

```bash
brew services stop mysql@8.4
```

Restart MySQL:

```bash
brew services restart mysql@8.4
```

Check its status:

```bash
brew services list
```

Log into the RSSMonster database:

```bash
mysql -u rssmonster -p -h localhost rssmonster
```

Log into MySQL as root:

```bash
mysql -u root -p
```

Check whether MySQL is listening on port 3306:

```bash
lsof -nP -iTCP:3306 -sTCP:LISTEN
```

## 18. Useful Version Checks

Check the complete local development environment:

```bash
node --version
npm --version
mysql --version
git --version
brew --version
```

RSSMonster development should use Node.js 22.

## Intel Macs

The instructions above assume Apple Silicon and therefore use:

```text
/opt/homebrew
```

On an Intel Mac, Homebrew normally uses:

```text
/usr/local
```

For example, the Node.js path becomes:

```bash
echo 'export PATH="/usr/local/opt/node@22/bin:$PATH"' >> ~/.zshrc
```

And MySQL:

```bash
echo 'export PATH="/usr/local/opt/mysql@8.4/bin:$PATH"' >> ~/.zshrc
```

## Quick Installation Summary

For a fresh Apple Silicon Mac, the main installation commands are:

```bash
xcode-select --install

/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

brew update
brew install git node@22 mysql@8.4

echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
echo 'export PATH="/opt/homebrew/opt/mysql@8.4/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

brew services start mysql@8.4

node --version
npm --version
mysql --version
git --version
```

Then clone RSSMonster, install the client, server, and inference dependencies,
create all three `.env` files, create the MySQL database, and run:

```bash
cd server
npm run db
```

After the migrations complete successfully, RSSMonster is ready to run locally.
