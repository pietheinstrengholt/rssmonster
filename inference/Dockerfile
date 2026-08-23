FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app/inference

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /app/models \
    && chown node:node /app/models

USER node

EXPOSE 3001

CMD ["npm", "run", "start"]
