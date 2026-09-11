# RSSMonster inference service

This is RSSMonster's isolated inference boundary. It is intended to listen only on localhost or a private Docker network.

The service owns all provider credentials and model calls, plus optional local
embedding inference. It provides embeddings, article classification, assistant
model access, Smart Folder recommendations, and feed rediscovery. It has no
database access or RSSMonster persistence logic.

## Connection reliability

The server and inference service now use an explicit reliability contract:

- Every inference HTTP request has a bounded, validated `X-Request-ID`. The same
  ID is returned in the response and included in content-safe request, queue,
  and failure diagnostics, including streamed assistant requests.
- HTTP lifecycle logging distinguishes completed, failed, and prematurely
  aborted requests and records exactly one terminal outcome per request.
- Client cancellation is propagated to Qwen embeddings and generation and to
  ModernBERT scoring. Pending work is removed before it starts; already-running
  native work remains accounted for until it settles because Transformers.js
  execution cannot be interrupted safely.
- Local Qwen embeddings and generation and ModernBERT scoring use
  concurrency-one bounded FIFO queues. Saturated queues reject immediately with HTTP `503`,
  `Retry-After: 5`, and `{"error":"inference_queue_full"}`.
- The listener opens before configured models initialize. `/health` reports
  process liveness, `/ready` reports lifecycle and required-model readiness, and
  inference routes return `not_ready` without enqueueing work during startup or
  shutdown. Queue saturation remains endpoint-specific overload and does not
  change global readiness.
- The RSSMonster server keeps separate circuit breakers for embeddings,
  classification, non-streaming assistant, Smart Folder, and feed-rediscovery
  JSON requests. Repeated connection, timeout, and readiness failures open only
  the affected capability's circuit; queue overload remains endpoint-level load
  shedding. One half-open probe tests recovery after the cooldown. Requests are
  not automatically retried.
- Crawl deadlines and configured inference timeouts are composed with caller
  cancellation so expired work releases pending queue and network capacity.
- Diagnostic and failure logging uses safe categorical metadata rather than
  request bodies, article text, prompts, model output, vectors, provider errors,
  URLs containing credentials, authorization values, or secrets.

Production startup loads `inference/.env` before provider singletons are
created, ensuring model, dtype, provider, and queue settings take effect.

## Providers and configuration

Each capability independently selects `local` or `openai-compatible` through
`EMBEDDING_PROVIDER`, `GENERATION_PROVIDER`, or `CLASSIFICATION_PROVIDER`.
`ASSISTANT_PROVIDER` supports `openai-compatible`. Each remote capability owns
its `*_BASE_URL`, `*_API_KEY`, and `*_MODEL`; embeddings also configure
`EMBEDDING_DIMENSIONS`. OpenAI, Ollama, LM Studio, and other compatible services
use the same transport adapter. Assistant calls use Chat Completions with tools
and streaming through the existing Agents SDK adapter.

`GENERATION_MODEL` supplies the default for summaries, tags, recommendations,
feed rediscovery, and semantic labels. Optional remote workload overrides are
`GENERATION_ARTICLE_MODEL`, `GENERATION_SMART_FOLDER_MODEL`, and
`GENERATION_FEED_REDISCOVERY_MODEL`. Local generation uses one loaded model.
`OPENAI_OMIT_TEMPERATURE` remains the shared compatibility switch for generated
text and remote scores; assistant reasoning remains configured in server/.env.

See [the inference configuration guide](../docs/inference.md#capability-configuration)
for fully local, mixed Ollama/LM Studio/OpenAI, fully external, and migration
examples. Old provider names and global OpenAI settings remain deprecated
aliases for one release. Explicit compatible providers require endpoints and
keys at startup. Legacy `openai` keeps its historical model settings and default
OpenAI URL. Startup validates configuration before loading any selected models;
external endpoints are not probed. Leave assistant settings and legacy global
credentials unset for local inference without chat.

## Local models

```env
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
EMBEDDING_DIMENSIONS=1024
GENERATION_PROVIDER=local
GENERATION_MODEL=onnx-community/Qwen3.5-0.8B-ONNX
CLASSIFICATION_PROVIDER=local
CLASSIFICATION_MODEL=onnx-community/ModernBERT-base-nli-ONNX
```

Article classification is orchestrated as three separate calls: bullet
summarization and tag generation use `GENERATION_PROVIDER`; combined
advertisement/tone/quality scoring uses `CLASSIFICATION_PROVIDER`.

Qwen generation uses `onnx-community/Qwen3.5-0.8B-ONNX` in non-thinking mode
through the model card's Transformers.js processor and conditional-generation
API. The configured `q4` model runs on CPU, initializes during startup, and
serializes generation through one shared model instance. Its bounded queue runs
one generation job and accepts four pending jobs by default. Configure the
positive pending limit with `GENERATION_QUEUE_MAX_PENDING`; excess work is
rejected instead of growing an unbounded in-memory backlog.
Qwen-backed HTTP requests rejected at that boundary return `503`, a
`Retry-After: 5` header, and `{"error":"inference_queue_full"}`.

The local scoring provider uses
`onnx-community/ModernBERT-base-nli-ONNX` as a zero-shot NLI classifier on CPU.
It evaluates the three scoring dimensions independently and maps their
probabilities into RSSMonster's existing 0–100 score buckets. When selected,
it initializes during service startup and reuses one model instance. Scoring
runs one job at a time with four waiting jobs by default; configure the positive
pending limit with `MODERNBERT_QUEUE_MAX_PENDING`. Pending work is removed when
its HTTP request disconnects, while already-running native work remains
accounted for until it settles. Queue overload uses the same stable `503`,
`Retry-After`, and `inference_queue_full` HTTP contract as local generation.

The compatible embedding adapter retains `text-embedding-3-small` as its remote default. Configure `EMBEDDING_PROVIDER=openai-compatible`, `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSIONS`.

Local Qwen embedding inference runs one batch and permits four pending batches
by default. Configure the positive pending limit with
`EMBEDDING_QUEUE_MAX_PENDING`. Disconnected pending batches are removed before
execution, while disconnected running work remains accounted for until native
inference settles. Excess requests receive `503`, `Retry-After: 5`, and
`{"error":"inference_queue_full"}` without changing global readiness.

The Qwen provider uses `onnx-community/Qwen3-Embedding-0.6B-ONNX` through Transformers.js. It follows the model card's `feature-extraction` pipeline with last-token pooling and L2 normalization on CPU using `fp32`, returning the model's native 1024-dimensional vectors. Select it with `EMBEDDING_PROVIDER=local`. The provider initializes during service startup and reuses one pipeline instance for the lifetime of the Node process. Embedding requests are processed one at a time to avoid concurrent inference through the same model instance.

Do not switch an RSSMonster database with existing semantic vectors between providers. The current schema does not attach embedding-space metadata to event, topic, or island aggregate vectors, and no vector migration is provided.

RSSMonster article, event, topic, island, and taxonomy inputs are embedded as documents without a query instruction. This matches Qwen3's documented document behavior and keeps one consistent vector representation across the semantic pipeline.

## Model cache

Transformers.js downloads missing Hugging Face Qwen embedding, Qwen3.5 generation,
and ModernBERT model files
automatically during startup when their provider is selected. RSSMonster stores those files
in `inference/.cache/models` by default, or in the location configured by
`INFERENCE_MODEL_CACHE_DIR`.

Relative cache paths are resolved from the `inference` project directory. Model files are local runtime data and are not part of the Git repository. Deleting the cache causes Transformers.js to download the required model files again the next time that model is used.

## Setup

```bash
cd inference
npm install
cp .env.example .env
```

## Run

Start with automatic restarts during development:

```bash
npm run dev
```

Development mode enables content-safe inference diagnostics. Startup logs each
selected on-device model with `loaded:true`, followed by a message that crawling
can start. The service begins listening before selected models initialize, so
health checks receive an HTTP response throughout startup. Inference endpoints
remain gated until every configured required model is ready. Each embedding
request logs its batch size, selected provider and model,
provider dispatch, and completion duration. Article classification logs separate
activity for bullet summaries, tag generation, and article scoring. Assistant,
Smart Folder recommendation, and feed rediscovery calls likewise log their
selected provider and completion duration. Article text, prompts, generated
content, and vectors are not logged. Set `INFERENCE_DEBUG=true` explicitly to
enable the same diagnostics with another start command.

Start normally:

```bash
npm start
```

By default the service listens at `http://127.0.0.1:3001`. Configure the listener with `INFERENCE_HOST` and `INFERENCE_PORT`. Configure model storage with `INFERENCE_MODEL_CACHE_DIR`, the maximum embedding batch size with `EMBEDDING_MAX_BATCH_SIZE`, and the local embedding pending-work bound with `EMBEDDING_QUEUE_MAX_PENDING`.

## Endpoints

- `GET /health` is process liveness and returns `200` while Express is alive.
- `GET /ready` returns `503` during model startup, initialization failure, or
  shutdown, and `200` once required models are initialized. Local generation or
  scoring queue saturation does not change global readiness; affected requests
  receive the endpoint-level queue-overload response.
- `GET /api/embeddings/info` returns safe model metadata and its loaded state.
- `POST /api/embeddings` embeds a non-empty `texts` array.
- `POST /api/classifications/article` summarizes, tags, and scores an article.
- `POST /api/assistant/model` and `/api/assistant/model/stream` provide the model boundary used by the server-owned agent tools.
- `POST /api/smart-folder-recommendations` generates personalized folder suggestions.
- `POST /api/feed-rediscovery` suggests a replacement for a broken feed URL.
- `POST /api/semantic-labels` generates event, topic, and interest-island labels from
  bounded semantic context. Pass `context` plus one or more boolean selectors named
  `event`, `topic`, and `island`; the response contains the requested labels.

```bash
curl -X POST http://127.0.0.1:3001/api/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"texts":["RSS readers organize articles into feeds."]}'
```

## Inference API contract

`GET /api/capabilities` returns version 1 service metadata and explicit embeddings,
generation, classification, and assistant entries. It is available outside the
work readiness gate, reads captured configuration and local model loaded state,
and never initializes models or probes providers. Credentials and base URLs are
excluded. `/health` remains liveness, `/ready` remains the required-work readiness
gate, and `/api/embeddings/info` retains specialized embedding details.

See [the inference API contract](../docs/inference.md#inference-api-contract) for
the schema, configured/available semantics, examples, and compatibility rules.

## Optional inference authentication

The server transport uses `INFERENCE_BASE_URL` (`INFERENCE_URL` remains a fallback)
and sends `X-Inference-API-Key` when `INFERENCE_API_KEY` is nonempty. Configure the
exact same opaque shared secret on server/workers and inference. With no inference
key, authentication is disabled. `/health` remains public; `/ready` and all API
routes are protected when enabled. HTTP 401 maps to `INFERENCE_UNAUTHORIZED` and
does not open transient failure circuits. Keys stay out of metadata and logs.
See the inference documentation for generation, HTTPS, and deployment examples.
