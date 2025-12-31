# ---------- client build ----------
FROM node:20-alpine AS client-build

WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client .
RUN npm run build

# ---------- server deps ----------
FROM node:20-alpine AS server-deps

WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ---------- runtime ----------
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# copy server code
COPY server /app
COPY --from=server-deps /build/server/node_modules /app/node_modules

# copy built client
COPY --from=client-build /build/client/dist /app/public

# non-root user
RUN addgroup -S rssmonster && adduser -S rssmonster -G rssmonster
USER rssmonster

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "app.js"]
