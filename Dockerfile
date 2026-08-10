# =========================
# 1. Build Vue client
# =========================
FROM node:22-alpine AS client-build

WORKDIR /build/client

COPY client/package*.json ./
RUN npm ci

COPY client .
RUN npm run build


# =========================
# 2. Install server deps
# =========================
FROM node:22-alpine AS server-deps

# Build tooling is needed if sqlite3 must compile a native module.
RUN apk add --no-cache python3 make g++

WORKDIR /build/server

COPY server/package*.json ./
RUN npm ci --omit=dev


# =========================
# 3. Final runtime image
# =========================
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app/server

# Copy server source.
COPY server .

# Copy production server dependencies.
COPY --from=server-deps /build/server/node_modules ./node_modules

# Copy built Vue client into the directory served by Express.
COPY --from=client-build /build/client/dist ./dist

# Create the non-root runtime user and writable SQLite data directory.
RUN addgroup -S rssmonster \
    && adduser -S rssmonster -G rssmonster \
    && mkdir -p /app/data \
    && chown -R rssmonster:rssmonster /app/server /app/data

USER rssmonster

EXPOSE 3000

# Apply pending Sequelize migrations before starting RSSMonster.
# This makes a fresh SQLite deployment self-initializing while remaining
# safe for existing MySQL/SQLite databases through SequelizeMeta.
CMD ["sh", "-c", "npm run db && exec npm run start"]