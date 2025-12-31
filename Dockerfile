# =========================
# 1. Build Vue client
# =========================
FROM node:20-alpine AS client-build

WORKDIR /build/client

COPY client/package*.json ./
RUN npm ci

COPY client .
RUN npm run build
# result: /build/client/dist


# =========================
# 2. Install server deps
# =========================
FROM node:20-alpine AS server-deps

WORKDIR /build/server

COPY server/package*.json ./
RUN npm ci --omit=dev
# result: /build/server/node_modules


# =========================
# 3. Final runtime image
# =========================
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app/server

# copy server source
COPY server .

# copy server deps
COPY --from=server-deps /build/server/node_modules ./node_modules

# copy built client into server
# ⚠️ adjust path if your Express app uses a different static dir
COPY --from=client-build /build/client/dist ./dist

# optional: non-root user
RUN addgroup -S rssmonster && adduser -S rssmonster -G rssmonster
USER rssmonster

EXPOSE 3000

CMD ["npm", "run", "start"]
