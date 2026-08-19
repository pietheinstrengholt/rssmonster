---
layout: page
title: Inference
parent: Administration
nav_order: 3
---

# Inference

RSSMonster uses a standalone service for every provider inference call. It
handles embeddings, article classification, assistant model requests, Smart
Folder recommendations, and feed rediscovery. The server retains authenticated
tools and database/business logic; the inference process has no database access.

For provider selection, model-specific environment variables, and observed
semantic behavior, see [Model Usage](model-usage.md), [OpenAI](model-openai.md),
and [Qwen](model-qwen.md).

## Configure the Connection

The RSSMonster server only needs the inference service address and request
timeout:

```env
# server/.env
INFERENCE_URL=http://127.0.0.1:3001
INFERENCE_TIMEOUT_MS=30000
INFERENCE_AGENT_TIMEOUT_MS=300000
INFERENCE_AI_ENABLED=true
SKIP_ARTICLE_CLASSIFICATION_ANALYSIS=false
```

When running Qwen on slower hardware, use a longer timeout such as `600000`.
If the server and inference processes run in separate containers, use the
private inference service hostname instead of `127.0.0.1`.

Provider credentials and models are selected in `inference/.env`, not
`server/.env`. For example, the following configuration uses Qwen locally for
embeddings and generation, ModernBERT locally for article scoring, and OpenAI
for the assistant:

```env
INFERENCE_HOST=127.0.0.1
INFERENCE_PORT=3001
INFERENCE_DEBUG=false
INFERENCE_MODEL_CACHE_DIR=.cache/models
EMBEDDING_PROVIDER=qwen
GENERATION_PROVIDER=qwen
ARTICLE_SCORING_PROVIDER=modernbert
ASSISTANT_PROVIDER=openai
EMBEDDING_MAX_BATCH_SIZE=8
EMBEDDING_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
EMBEDDING_DIMENSIONS=1024
GENERATION_MODEL=onnx-community/Qwen3.5-0.8B-ONNX
GENERATION_DTYPE=q4
MODERNBERT_MODEL=onnx-community/ModernBERT-base-nli-ONNX
MODERNBERT_DTYPE=q8
OPENAI_API_KEY=your-openai-api-key
ASSISTANT_MODEL=gpt-4o-mini
```

`EMBEDDING_PROVIDER` controls semantic vectors for articles, events, topics,
islands, and taxonomy. `GENERATION_PROVIDER` separately controls bullet
summaries, tags, Smart Folder recommendations, and feed rediscovery and accepts
`openai` or `qwen`. `ARTICLE_SCORING_PROVIDER` controls advertisement, tone,
and writing/information-quality scores and accepts `openai` or `modernbert`.
`ASSISTANT_PROVIDER` independently controls assistant responses and currently
accepts only `openai`.

Article processing makes three separate calls: one for bullet summaries, one
for tags, and one for advertisement, tone, and writing/information-quality
scores. Set `ARTICLE_SCORING_PROVIDER=modernbert` to run only the scoring call
locally. Transformers.js downloads missing ModernBERT assets during startup and
reuses them from `INFERENCE_MODEL_CACHE_DIR` on later starts.

Add the settings for the selected [OpenAI](model-openai.md) or
[Qwen](model-qwen.md) provider. Keep the service on loopback or a private
Docker network because its HTTP API does not currently require authentication.

## Run the Service

Install dependencies once and create the local configuration:

```bash
cd inference
npm install
cp .env.example .env
```

Run with automatic restarts and inference diagnostics during development:

```bash
npm run dev
```

Run normally with:

```bash
npm start
```

Start inference before a crawl or semantic job that needs embeddings. Do not
run multiple local inference processes or PM2 cluster instances: the local
provider is designed to reuse one model instance and serialize inference work.

## PM2 Production Setup

The root `ecosystem.config.cjs` includes `rssmonster-inference`. It runs
`inference/src/index.js` from the inference directory as exactly one fork-mode
instance, allowing the service to load `inference/.env` normally.

Before the first production start, install dependencies and create the
configuration file:

```bash
cd inference
npm ci --omit=dev
cp .env.example .env
```

Edit `inference/.env` for [OpenAI](model-openai.md) or
[Qwen](model-qwen.md), then start or reload all RSSMonster processes from the
repository root:

```bash
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
pm2 status rssmonster-web rssmonster-worker rssmonster-inference
```

Useful inference commands are:

```bash
pm2 logs rssmonster-inference
pm2 restart rssmonster-inference --update-env
pm2 describe rssmonster-inference
```

Always use fork mode with one inference instance. PM2 cluster mode or multiple
instances would load multiple local models and increase memory consumption.
The supplied `deploy.sh` preserves `inference/.env`, installs inference
dependencies, and verifies that the inference PM2 process is running.

## Health and Diagnostics

Check service health:

```bash
curl http://127.0.0.1:3001/health
```

Inspect the active embedding provider and its loaded state:

```bash
curl http://127.0.0.1:3001/api/embeddings/info
```

The information response reports the provider, model, dimensions, maximum
batch size, and whether the model is loaded. Selected on-device models are
loaded before the HTTP listener starts, and the console reports when crawling
can begin. The response does not expose credentials or cache paths.

Set `INFERENCE_DEBUG=true`, or use `npm run dev`, to log model loading and
content-safe request activity for embeddings, bullet summaries, tags, article
scoring, assistant responses, Smart Folder recommendations, and feed
rediscovery. The logs include provider dispatch and completion duration, but
not article bodies, prompts, generated content, vectors, or secrets.

If the server reports an inference timeout, first confirm that the inference
process is running and inspect its console. Missing local model assets are
downloaded and initialized before the service begins listening. A capability
assigned to OpenAI does not load its corresponding local model.
