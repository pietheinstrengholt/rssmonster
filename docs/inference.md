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
SKIP_SEMANTIC_LABELING=false
```

`INFERENCE_AI_ENABLED` is the server-wide kill switch. When it is not explicitly
`true`, no server or worker path may contact the inference service, regardless of
the feature-specific skip settings.

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
ASSISTANT_RATE_LIMIT_WINDOW_MS=900000
ASSISTANT_RATE_LIMIT_MAX=100
EMBEDDING_PROVIDER=qwen
GENERATION_PROVIDER=qwen
ARTICLE_SCORING_PROVIDER=modernbert
ASSISTANT_PROVIDER=openai
EMBEDDING_MAX_BATCH_SIZE=8
EMBEDDING_QUEUE_MAX_PENDING=4
EMBEDDING_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
EMBEDDING_DIMENSIONS=1024
GENERATION_MODEL=onnx-community/Qwen3.5-0.8B-ONNX
GENERATION_DTYPE=q4
GENERATION_QUEUE_MAX_PENDING=4
MODERNBERT_MODEL=onnx-community/ModernBERT-base-nli-ONNX
MODERNBERT_DTYPE=q8
MODERNBERT_QUEUE_MAX_PENDING=4
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

Local Qwen embeddings use one running job and a bounded pending queue. The
default `EMBEDDING_QUEUE_MAX_PENDING=4` permits four waiting batches and must be
a positive integer. Disconnected pending requests are removed before execution;
disconnected running requests remain accounted for until native inference
settles. Excess requests receive HTTP `503`, `Retry-After: 5`, and
`{"error":"inference_queue_full"}` without changing global readiness.

Local Qwen generation uses one running job and a bounded pending queue. The
default `GENERATION_QUEUE_MAX_PENDING=4` permits four waiting jobs; it must be a
positive integer. Requests beyond that pending limit are rejected so slow local
generation cannot create an unbounded backlog. Qwen-backed endpoints report
that condition as HTTP `503` with `Retry-After: 5` and the stable JSON body
`{"error":"inference_queue_full"}`.

Local ModernBERT scoring also uses one running job and a bounded pending queue.
The default `MODERNBERT_QUEUE_MAX_PENDING=4` permits four waiting scoring jobs
and must be a positive integer. Disconnected pending requests are removed before
execution; disconnected running requests remain accounted for until the native
classifier settles. Scoring overload uses the same HTTP `503`, `Retry-After`,
and `inference_queue_full` contract.

Assistant model endpoints are limited per client address. The default allows
100 requests per 15-minute window; use `ASSISTANT_RATE_LIMIT_WINDOW_MS` and
`ASSISTANT_RATE_LIMIT_MAX` to adjust that policy.

Optional article enrichment is dispatched through one combined classification
request that returns bullet summaries, inferred tags, advertisement and tone
scores, and writing/information-quality scores. The inference service may still
use different configured providers internally for generation and scoring.
Transformers.js downloads missing ModernBERT assets during startup and reuses
them from `INFERENCE_MODEL_CACHE_DIR` on later starts.

For local Qwen/ModernBERT providers, embedding, scoring, and generation share a
single priority gate. Waiting embedding work has the highest priority, followed
by scoring and then generated text. This protects the ordered crawl pipeline
when `rssmonster-ai-worker` is also using inference. An active call is allowed
to finish; prioritization applies to queued work and does not interrupt model
execution.

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
pm2 status rssmonster-web rssmonster-worker rssmonster-ai-worker rssmonster-inference
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
curl http://127.0.0.1:3001/ready
```

`/health` is liveness: it returns HTTP `200` while the Node/Express process is
alive, including while models are starting. `/ready` is acceptance readiness:
it returns HTTP `503` while required models are initializing, after an
initialization failure, or during shutdown. Local generation or scoring queue
saturation does not change global readiness; only requests needing the full
queue receive the endpoint-level overload response. Every response includes
`X-Request-ID`. Inference endpoints also return `503`, `Retry-After: 5`, and
`{"error":"not_ready",...}` until model initialization completes; they do not
enqueue work during that period.

Inspect the active embedding provider and its loaded state:

```bash
curl http://127.0.0.1:3001/api/embeddings/info
```

The information response reports the provider, model, dimensions, maximum
batch size, and whether the model is loaded. The HTTP listener opens first,
then selected on-device models load while `/ready` reports `503`. If model
initialization fails, the service records the failed readiness state, closes
the listener, and exits nonzero so the supplied PM2 configuration can restart
it. The response does not expose credentials or cache paths.

Set `INFERENCE_DEBUG=true`, or use `npm run dev`, to log model loading and
content-safe request activity for embeddings, bullet summaries, tags, article
scoring, assistant responses, Smart Folder recommendations, and feed
rediscovery. The logs include provider dispatch and completion duration, but
not article bodies, prompts, generated content, vectors, or secrets.

If the server reports an inference timeout, first confirm that the inference
process is running and inspect its console. The HTTP listener opens before
missing local model assets are downloaded and initialized; `/health` remains
available while `/ready` reports `503` until initialization completes. A
capability assigned to OpenAI does not load its corresponding local model.
