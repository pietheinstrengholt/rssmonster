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
semantic behavior, see [Model Usage]({% link model-usage.md %}), [OpenAI]({% link model-openai.md %}),
and [Qwen]({% link model-qwen.md %}).

## Server integration

Server domain services use capability contracts under `server/services/ai/`.
Embeddings, combined article classification, named generation workloads, and
assistant model requests share one RSSMonster inference provider adapter. That
adapter alone knows inference HTTP paths; `inferenceClient` owns transport,
request IDs, cancellation, timeouts, safe errors, and existing circuit breakers.
Agent tools and orchestration remain server-owned.

The AI health layer combines `/health`, `/ready`, and validated `/api/capabilities`
metadata. Server feature permissions may restrict use but never establish remote
capability availability. Provider configuration remains private to inference. See the repository's
`server/services/ai/README.md` for the internal contracts and dependency map.

## Inference API contract

| Endpoint | Responsibility |
| --- | --- |
| `GET /health` | Process liveness: HTTP 200 with `{"status":"ok","state":"starting"}` during startup (state follows lifecycle). |
| `GET /ready` | Required-work readiness: HTTP 200 with `{"status":"ready","state":"ready","acceptingWork":true}`, otherwise HTTP 503 with `status:"not_ready"`, current state, `acceptingWork:false`, and `Retry-After: 5`. |
| `GET /api/capabilities` | Descriptive service and capability metadata, HTTP 200 even during startup/shutdown. Never loads models, executes inference, or probes an external endpoint. Invalid internal metadata produces a generic HTTP 500. |
| `GET /api/embeddings/info` | Existing specialized embedding details (including batch limit and loaded state), behind the global readiness gate. Its historical provider labels remain unchanged. |

RSSMonster consumes discovery through `getInferenceCapabilities(options)` in its AI
layer. Only the inference provider adapter owns the HTTP path. The response is
validated and projected onto known fields before use. Discovery is descriptive,
not configurational: RSSMonster does not configure providers. Credentials and
provider base URLs stay private to inference. No application data is persisted
by inference, and discovery returns no prompts, outputs, vectors, or provider errors.

### Version 1 schema and semantics

All fields shown below are required. Top-level `service` is exactly
`rssmonster-inference`, `apiVersion` is the string `1`, `version` is the inference
package version (independent of contract compatibility), and `status` is one of
`starting`, `ready`, `failed`, or `shutting_down`.

The four fixed capability entries are `embeddings`, `generation`, `classification`,
and `assistant`. Each has boolean `configured` and `available` fields plus
`provider` and `model`. Providers are normalized to `local` or `openai-compatible`.
Models are nonempty identifiers, not URLs or free text. Embeddings additionally
require `dimensions`, a positive safe integer when configured.

- `configured:true` means validated provider/model settings and required credentials
  were present when the service was constructed. It does not verify remote credentials.
- `available:true` requires configured settings, global `status:"ready"`, and a
  loaded model for local execution. It means eligible to accept work, not guaranteed
  success or spare queue capacity. External clients initialize lazily; their first
  request may still encounter an unavailable endpoint or rejected credentials.
- Unconfigured entries have both booleans false and null provider/model metadata;
  unconfigured embeddings also have null dimensions. Configured entries retain
  metadata while unavailable. All availability flags are false outside `ready`.

The snapshot shares inference's configuration resolvers and identifier validation;
local availability reads the providers used by startup. Changes to environment
variables after construction require restarting inference. `generation.model`
describes the configured default; existing workload overrides may use other models.
Smart Folder recommendations, feed rediscovery, and semantic labels remain generation
workloads, not separate providers. `classification.model` describes article scoring;
the combined article-analysis route also uses generation for summaries and tags.
The global readiness gate still requires every configured required local model.

### Examples

A. Local core inference with optional assistant unconfigured (there is currently
no in-process local assistant provider):

```json
{
  "service": "rssmonster-inference",
  "apiVersion": "1",
  "version": "2.3.0",
  "status": "ready",
  "capabilities": {
    "embeddings": {
      "configured": true,
      "available": true,
      "provider": "local",
      "model": "onnx-community/Qwen3-Embedding-0.6B-ONNX",
      "dimensions": 1024
    },
    "generation": {
      "configured": true,
      "available": true,
      "provider": "local",
      "model": "onnx-community/Qwen3.5-0.8B-ONNX"
    },
    "classification": {
      "configured": true,
      "available": true,
      "provider": "local",
      "model": "onnx-community/ModernBERT-base-nli-ONNX"
    },
    "assistant": {
      "configured": false,
      "available": false,
      "provider": null,
      "model": null
    }
  }
}
```

B. Mixed external embeddings/generation/assistant and local classification:

```json
{
  "service": "rssmonster-inference",
  "apiVersion": "1",
  "version": "2.3.0",
  "status": "ready",
  "capabilities": {
    "embeddings": {
      "configured": true,
      "available": true,
      "provider": "openai-compatible",
      "model": "embedding-model",
      "dimensions": 1024
    },
    "generation": {
      "configured": true,
      "available": true,
      "provider": "openai-compatible",
      "model": "generation-model"
    },
    "classification": {
      "configured": true,
      "available": true,
      "provider": "local",
      "model": "onnx-community/ModernBERT-base-nli-ONNX"
    },
    "assistant": {
      "configured": true,
      "available": true,
      "provider": "openai-compatible",
      "model": "assistant-model"
    }
  }
}
```

C. Partially configured service during startup: local core settings exist,
models are not globally ready, and the optional assistant is absent:

```json
{
  "service": "rssmonster-inference",
  "apiVersion": "1",
  "version": "2.3.0",
  "status": "starting",
  "capabilities": {
    "embeddings": {
      "configured": true,
      "available": false,
      "provider": "local",
      "model": "onnx-community/Qwen3-Embedding-0.6B-ONNX",
      "dimensions": 1024
    },
    "generation": {
      "configured": true,
      "available": false,
      "provider": "local",
      "model": "onnx-community/Qwen3.5-0.8B-ONNX"
    },
    "classification": {
      "configured": true,
      "available": false,
      "provider": "local",
      "model": "onnx-community/ModernBERT-base-nli-ONNX"
    },
    "assistant": {
      "configured": false,
      "available": false,
      "provider": null,
      "model": null
    }
  }
}
```

The current startup requires embeddings, generation, and classification. It does
not support a ready embeddings-only deployment. Missing remote credentials are
represented as unconfigured during the startup observation window, but missing
required configuration still fails startup and closes the listener. Optional
assistant absence is supported throughout a healthy service lifetime.

### Compatibility

Version 1 consumers ignore unknown additive fields and capability names. Known
capabilities and required fields must remain present with the documented types
and semantics. Removing/renaming fields or capabilities, changing types or
availability meanings, or introducing new required provider/state values requires
a new API contract version. Package releases alone do not change the contract.

Malformed contracts raise the safe internal `INFERENCE_CONTRACT_INVALID` error;
unsupported string versions raise `INFERENCE_CONTRACT_VERSION_UNSUPPORTED`.
Transport errors retain existing request IDs, timeouts, cancellation, and circuit
behavior. Discovery has its own `capabilities` circuit and makes no automatic retries.

Upgrade inference before the server. A missing endpoint, invalid response, or
unsupported version leaves observed capabilities unavailable; the server never
falls back to guessing them from configuration or provider names. Liveness and
readiness remain independently observable through their existing endpoints.
Discovery does not replace `/ready` or capability-specific work calls.

## Configure inference from any deployment

MySQL servers, SQLite servers, and Desktop use the same server-side connection
resolver. Inference is optional and runs separately; Desktop does not bundle
models or an inference process.

Administrators can open **Settings → AI / Inference** to save an HTTP(S) endpoint
and optional shared secret. Use **Test connection** to check the form without saving, then **Save** to apply it.
**Refresh** checks the saved connection. An API key is optional.
The browser contacts RSSMonster, which checks inference liveness, authentication,
readiness, and the versioned capability contract through its normal transport.
The four capability cards show advertised provider/model metadata, including
embedding dimensions. They support partial availability and clear authentication,
connection, startup, and contract failure states.

### Precedence and administration

1. A nonempty `INFERENCE_BASE_URL` makes the connection environment-managed.
2. Legacy `INFERENCE_URL` remains a fallback with the same environment precedence.
3. Otherwise, the deployment's saved Settings connection is used.
4. Without either, no inference endpoint is configured. There is no implicit localhost connection.

An environment key alone never creates an endpoint or replaces a database key.
Environment values are never copied into the database. When an environment URL
exists, Settings hides endpoint/key inputs and Save/Remove controls entirely;
capability status and refresh remain visible. Direct update/delete API calls are
also rejected. Only administrators can read connection metadata, change settings,
remove the connection, or run these connection checks. Existing users retain their
normal permissions to consume intelligent features.

Explicit `INFERENCE_AI_ENABLED=false` remains a deployment kill switch, and
`INFERENCE_ASSISTANT_ENABLED=false` can prohibit assistant use. These switches
are optional permission overrides; enabling them alone does not create a connection.
Existing article and semantic skip flags and per-feed preferences remain respected.

### Deployment examples

- Comprehensive MySQL Docker: `INFERENCE_BASE_URL=http://inference:3001`; optionally
  forward the same `INFERENCE_API_KEY` to server/workers and inference.
- Remote inference: `INFERENCE_BASE_URL=https://inference.example.internal`; set
  the matching optional key privately in the environment and use HTTPS across
  untrusted networks.
- SQLite server: use either environment variables or Settings. The lightweight
  Compose profile can forward a remote connection without adding a model container.
- Desktop: open Settings and save the remote endpoint and optional key. Its embedded
  Express server uses the same SQLite table, resolver, encryption, and migrations.
- Any deployment without inference: leave the URL unset and do not save a connection.

SQLite remains limited to serial user/feed crawling and single optional-job
concurrency. MySQL full-text search uses a SQLite-compatible fallback. The lightweight
SQLite and Desktop profiles do not start an AI worker; background article enrichment
and semantic-label jobs still require an optional-job consumer. Connecting inference
does not add that worker or remove database concurrency limits. Desktop can use remote
capabilities such as assistant and Smart Folder generation through the normal server API.
Existing per-feed analysis/embedding opt-outs are preserved; review them when enabling
inference for feeds that were added without a connection.

### Stored secrets, changes, and backups

The deployment-level `inference_settings` singleton is separate from user reader
preferences. Stored keys use AES-256-GCM with a purpose-specific key derived through
HKDF from `FEVER_CREDENTIAL_SECRET`. Ciphertext is excluded from default model reads
and serialization. APIs return only `apiKeyConfigured`, never the key or ciphertext.
Back up the database **and** the stable server secret (Desktop stores it in its existing
private `secrets.json`). If that secret is rotated or lost, replace/remove the saved
inference key. No extra required encryption environment variable is introduced.

API updates explicitly use `apiKeyAction: "keep"`, `"replace"`, or `"remove"`.
Only replacement includes `apiKey`; an empty replacement removes authentication.
Keeping the key never sends a placeholder back to the server. Removing the connection
requires UI confirmation and clears its endpoint/key without deleting articles or
semantic data or changing the inference service itself.

Runtime requests resolve current configuration, including in separate workers.
Capability/status snapshots have a 15-second TTL and contain no key. Connection
identity changes invalidate status and circuit state; Refresh checks the saved
connection again. Draft tests do not replace the cached status. Saved changes take effect without a server restart.

The administrator API is `GET/PUT/DELETE /api/setting/inference` and
`POST /api/setting/inference/test`. A request with endpoint/key-action fields tests
that draft without saving; an empty request uses the saved/effective connection. No provider/model configuration is accepted: Ollama, LM Studio,
OpenAI-compatible endpoints, local Qwen, and ModernBERT remain entirely configured
inside the inference service. RSSMonster only discovers their safe metadata.

### Database upgrades

Run the normal `npm run db` before starting an upgraded server. Docker already does
this, and Desktop runs the same migration loader automatically. The loader preserves
existing SequelizeMeta history and accepts both historical CommonJS and new ESM
migrations, including the singleton table migration. Use `npm run db` rather than
invoking the older Sequelize CLI migration command directly, which does not discover
`.mjs` files. Fresh installations have no saved connection row.

## Optional shared-secret authentication

`INFERENCE_BASE_URL` is the address RSSMonster server and workers use to reach the
standalone inference service. Examples:

```env
# Local
INFERENCE_BASE_URL=http://127.0.0.1:3001
# Docker network
# INFERENCE_BASE_URL=http://inference:3001
# Remote/private host
# INFERENCE_BASE_URL=https://inference.example.internal
```

`INFERENCE_BASE_URL` takes precedence over the legacy `INFERENCE_URL` fallback.
The local default remains `http://127.0.0.1:3001`.

Authentication is opt-in. Generate a secret with `openssl rand -hex 32`, then set
`INFERENCE_API_KEY` to the **exact same value** in the server/worker environment and
inference environment. No default secret is provided:

```env
# Optional shared secret; configure the same value on both sides.
# INFERENCE_API_KEY=
```

The client sends `X-Inference-API-Key`. This is an opaque HTTP header value, not a
Bearer token or JWT. There are no required prefixes, hex/base64 formats, or token
parsing; inference performs exact shared-secret matching, preserving internal
whitespace. Use a sufficiently random value compatible with HTTP headers (no
line breaks or leading/trailing header whitespace).

- No key on inference: authentication is disabled, with or without a client key.
- No key on either side: existing communication continues unchanged.
- Matching keys: protected requests proceed normally.
- Inference key configured, client key missing or different: HTTP 401 with only
  `{"error":"unauthorized"}`. Duplicate key headers also fail closed.

`GET /health` stays public. `/ready`, `/api/capabilities`, `/api/embeddings/info`,
all work routes, and assistant streaming require authentication when enabled.
Authentication runs before readiness gates, body parsing, queues, and model work;
request IDs and safe lifecycle logging still apply. Discovery and health responses
never include keys. The server classifies 401 as `INFERENCE_UNAUTHORIZED` with
`Inference authentication failed`, even for readiness probes and streaming.
A 401 establishes transport reachability and resets transient failure counts;
it never opens an infrastructure circuit. Other resilience behavior is unchanged.

Compose forwards the optional key to inference, the web server, and both workers.
Its readiness probe reads the key from the container environment without printing
it. External probes can use public `/health`, or supply the custom header for
`/ready`. Keep keys out of committed files and diagnostic output.

Authenticated requests reject redirects to avoid forwarding the custom secret
header to another destination; configure the final inference URL directly.

Use HTTPS across untrusted networks: shared-secret authentication does not encrypt
traffic. This key authenticates RSSMonster to inference and is separate from the
provider API keys held privately by inference. No UI or remote configuration API
is introduced.

## Configure the Connection

The RSSMonster server only needs the inference service address and request
timeout:

```env
# server/.env
INFERENCE_BASE_URL=http://127.0.0.1:3001
INFERENCE_TIMEOUT_MS=30000
INFERENCE_AGENT_TIMEOUT_MS=300000
INFERENCE_AI_ENABLED=true
SKIP_ARTICLE_CLASSIFICATION_ANALYSIS=false
SKIP_SEMANTIC_LABELING=false
```

`INFERENCE_AI_ENABLED=false` is the optional server-wide kill switch. Otherwise,
a configured endpoint is required and inference advertises available capabilities.

When running Qwen on slower hardware, use a longer timeout such as `600000`.
If the server and inference processes run in separate containers, use the
private inference service hostname instead of `127.0.0.1`.

## Capability Configuration

Configuration is stateless and environment based. Provider credentials belong
only to inference, never to the RSSMonster server or database. Each capability
uses its own settings:

| Capability | Provider values | Model setting | Remote connection settings |
| --- | --- | --- | --- |
| Embeddings | `local`, `openai-compatible` | `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` | `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY` |
| Generation | `local`, `openai-compatible` | `GENERATION_MODEL` | `GENERATION_BASE_URL`, `GENERATION_API_KEY` |
| Classification (scores) | `local`, `openai-compatible` | `CLASSIFICATION_MODEL` | `CLASSIFICATION_BASE_URL`, `CLASSIFICATION_API_KEY` |
| Assistant | `openai-compatible` | `ASSISTANT_MODEL` | `ASSISTANT_BASE_URL`, `ASSISTANT_API_KEY` |

`local` runs the existing Qwen embedding, Qwen3.5 generation, or ModernBERT NLI
implementation. Model identifiers must fit those implementations; choosing a
model name does not install a different local architecture. Dtype, CPU execution,
caching, batch limits, and queues retain their existing settings.

`openai-compatible` uses the installed OpenAI SDK with the capability's own
endpoint, key, and model. OpenAI itself follows this same path. Both remote
generation and remote classification use Chat Completions; classification
retains the existing LLM scoring prompt and score normalization. The assistant
uses the Agents SDK's Chat Completions adapter, including tools and streaming.
No Responses API support is required. No Ollama, LM Studio, vLLM, or LocalAI
specific provider code is needed; endpoint support for the requested API,
model, and parameters is required.

Explicit `openai-compatible` selection requires a base URL and non-empty API
key at startup. Use a placeholder such as `ollama` for a server that ignores
authentication. Local capabilities need neither. Invalid providers, endpoints,
model identifiers, and embedding dimensions fail startup. Endpoints must be
HTTP(S) URLs without embedded user credentials or fragments. Errors name the
setting without echoing its value. Startup logs only capability, provider, and
model; keys and endpoint URLs are never logged.

Startup loads only selected local models before readiness. External readiness
means configuration is valid; it does not probe remote model availability or
credentials. Runtime failures retain the existing safe HTTP error and server
circuit-breaker behavior. The existing embedding-info HTTP metadata retains its
implementation labels for compatibility.

### A. Fully local inference

```env
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
EMBEDDING_DIMENSIONS=1024
GENERATION_PROVIDER=local
GENERATION_MODEL=onnx-community/Qwen3.5-0.8B-ONNX
CLASSIFICATION_PROVIDER=local
CLASSIFICATION_MODEL=onnx-community/ModernBERT-base-nli-ONNX
```

Leave `ASSISTANT_PROVIDER`, `ASSISTANT_MODEL`, `ASSISTANT_BASE_URL`, and assistant
and legacy global credentials unset to leave the optional assistant unavailable.
Keep `INFERENCE_ASSISTANT_ENABLED=false` in the server. Local assistant execution
inside inference is not implemented; to keep chat local too, configure its
compatible endpoint on your own host and select a tool-capable model.

### B. Ollama embeddings, LM Studio generation, ModernBERT scoring, OpenAI assistant

```env
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_BASE_URL=http://ollama:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
EMBEDDING_DIMENSIONS=1024

GENERATION_PROVIDER=openai-compatible
GENERATION_BASE_URL=http://lmstudio:1234/v1
GENERATION_API_KEY=lmstudio
GENERATION_MODEL=qwen3.5-4b

CLASSIFICATION_PROVIDER=local
CLASSIFICATION_MODEL=onnx-community/ModernBERT-base-nli-ONNX

ASSISTANT_PROVIDER=openai-compatible
ASSISTANT_BASE_URL=https://api.openai.com/v1
ASSISTANT_API_KEY=your-openai-api-key
ASSISTANT_MODEL=gpt-5-mini
```

### C. Fully external compatible inference

```env
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=your-embedding-api-key
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

GENERATION_PROVIDER=openai-compatible
GENERATION_BASE_URL=https://api.openai.com/v1
GENERATION_API_KEY=your-generation-api-key
GENERATION_MODEL=gpt-4o-mini

CLASSIFICATION_PROVIDER=openai-compatible
CLASSIFICATION_BASE_URL=https://api.openai.com/v1
CLASSIFICATION_API_KEY=your-classification-api-key
CLASSIFICATION_MODEL=gpt-4o-mini

ASSISTANT_PROVIDER=openai-compatible
ASSISTANT_BASE_URL=https://api.openai.com/v1
ASSISTANT_API_KEY=your-assistant-api-key
ASSISTANT_MODEL=gpt-4o-mini
```

Each endpoint can instead point to a different compatible service. Use model
names installed or available at that endpoint. Inference downloads no local
models in this configuration.

### Generation models and workload overrides

`GENERATION_MODEL` is the default for bullet summaries, generated tags, Smart
Folder recommendations, feed rediscovery, and event/topic/island labels.
Optional remote overrides are `GENERATION_ARTICLE_MODEL` (bullets, tags, labels),
`GENERATION_SMART_FOLDER_MODEL`, and `GENERATION_FEED_REDISCOVERY_MODEL`.
They use the generation endpoint and credentials. Local generation uses its one
loaded `GENERATION_MODEL`; workload model overrides apply only to remote calls.

For canonical remote configuration without a model, the default is
`gpt-4o-mini` across workloads. Legacy generation retains its previous defaults:
`gpt-4o-mini` for article/label work and `gpt-4.1-mini` for folder/feed work.
Set `OPENAI_OMIT_TEMPERATURE=true` if your generation or classification endpoint
rejects explicit temperature values; this existing shared compatibility switch
is preserved. Assistant reasoning remains an optional server-side
`ASSISTANT_REASONING_EFFORT` setting.

### D. Legacy configuration migration

Aliases remain available for one release, with a startup deprecation warning
that names settings without printing values:

| Legacy setting | Replacement |
| --- | --- |
| `EMBEDDING_PROVIDER=qwen` | `EMBEDDING_PROVIDER=local` |
| `GENERATION_PROVIDER=qwen` | `GENERATION_PROVIDER=local` |
| `ARTICLE_SCORING_PROVIDER=modernbert` | `CLASSIFICATION_PROVIDER=local` |
| `ARTICLE_SCORING_PROVIDER=openai` | `CLASSIFICATION_PROVIDER=openai-compatible` |
| Other `*_PROVIDER=openai` | `*_PROVIDER=openai-compatible` |
| `OPENAI_BASE_URL`, `OPENAI_API_KEY` | Separate `*_BASE_URL`, `*_API_KEY` for each remote capability |
| `OPENAI_EMBEDDING_MODEL`, `OPENAI_EMBEDDING_DIMENSIONS` | `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` |
| `MODERNBERT_MODEL` | `CLASSIFICATION_MODEL` |
| `OPENAI_MODEL_CRAWL` | `GENERATION_MODEL` (or `GENERATION_ARTICLE_MODEL`) and `CLASSIFICATION_MODEL` |
| `OPENAI_MODEL_SMART_FOLDERS` | `GENERATION_SMART_FOLDER_MODEL` |
| `OPENAI_MODEL_FEED_REDISCOVERY` | `GENERATION_FEED_REDISCOVERY_MODEL` |

Set `CLASSIFICATION_PROVIDER` to override `ARTICLE_SCORING_PROVIDER`. Non-empty
capability endpoints and keys take precedence over legacy global fallbacks.
Canonical model settings take precedence over legacy aliases; explicit
`GENERATION_MODEL` also takes precedence over legacy workload aliases. Canonical
workload overrides take precedence over `GENERATION_MODEL`.

For safety, legacy `EMBEDDING_PROVIDER=openai` (including an omitted provider) reads only
`OPENAI_EMBEDDING_MODEL` and `OPENAI_EMBEDDING_DIMENSIONS`, ignoring possibly stale
local `EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS`. Likewise, legacy
`GENERATION_PROVIDER=openai` (including an omitted provider) ignores the formerly local-only `GENERATION_MODEL`.
Change the provider and model/dimension settings together when migrating.
Legacy `openai` selection (also the historical default when a provider is
omitted) retains the SDK's default OpenAI URL if `OPENAI_BASE_URL` is absent.
For canonical selection, explicitly set `*_BASE_URL=https://api.openai.com/v1`.

Missing credentials for a required remote capability now fail startup with the
capability's setting name and legacy alias. An unconfigured optional assistant
is the sole exception. Model, dtype, batch, cache, queue, and lifecycle settings
otherwise retain their behavior. Do not remove the old configuration until all
remote capabilities have their own endpoint and credentials.

## OpenAI-compatible gateways and Ollama

Ollama and LM Studio run as separate services. A container's `127.0.0.1` refers
to that container. Use reachable Docker service names on a shared network, or
`host.docker.internal` where supported for services running on the host. On
Linux, host access may require a host-gateway mapping. Ensure the gateway binds
to an address reachable from inference. The example names `ollama` and
`lmstudio` assume those hosts are resolvable; RSSMonster Compose does not create
these services.

The MySQL Compose file forwards capability provider, endpoint, key, model, and
embedding dimension settings from the root `.env` to **inference only**. It also
forwards legacy aliases during migration. Defaults remain local embeddings,
generation, and classification, with no assistant credentials. Model and
dimension defaults are resolved by inference according to the selected provider.
For manual installation, put these settings in `inference/.env` instead.

`EMBEDDING_DIMENSIONS` describes returned vectors; inference does not send a
dimension-reduction parameter. The current local Qwen implementation requires
1024 dimensions. Remote dimensions must be positive safe integers and must match
the selected model's output. Do not switch models or embedding spaces on a
database containing existing semantic vectors; they are not interchangeable
and no vector migration is provided.

## Local Queues and Article Enrichment

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

Add the settings for the selected [OpenAI]({% link model-openai.md %}) or
[Qwen]({% link model-qwen.md %}) provider. Keep the service on loopback or a private
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

Edit `inference/.env` for [OpenAI]({% link model-openai.md %}) or
[Qwen]({% link model-qwen.md %}), then start or reload all RSSMonster processes from the
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
