---
layout: page
title: Model Usage
nav_order: 7
has_children: true
---

# Model Usage

RSSMonster routes all embedding generation through the standalone inference
service. The server does not select or load an embedding model itself: it sends
article, event, topic, interest-island, taxonomy, and duplicate-detection
embedding requests to the inference HTTP API.

The inference service currently supports these model families:

- [OpenAI]({% link model-openai.md %}), using `text-embedding-3-small` by default.
- [Qwen]({% link model-qwen.md %}), running `onnx-community/Qwen3-Embedding-0.6B-ONNX`
  locally with Transformers.js.
- Qwen3.5 generation, running `onnx-community/Qwen3.5-0.8B-ONNX` locally.
- ModernBERT article scoring, running
  `onnx-community/ModernBERT-base-nli-ONNX` locally.

## Server Configuration

For a manual installation, add the inference connection to `server/.env`:

```env
INFERENCE_BASE_URL=http://127.0.0.1:3001
INFERENCE_TIMEOUT_MS=30000
INFERENCE_CIRCUIT_FAILURE_THRESHOLD=5
INFERENCE_CIRCUIT_COOLDOWN_MS=30000
```

`INFERENCE_BASE_URL` is the base URL of the inference service. Use a private service
name instead of `127.0.0.1` when the processes run in separate containers.
`INFERENCE_TIMEOUT_MS` applies to non-agent inference requests. Local model startup
and CPU inference can need a longer timeout; the [Qwen guide]({% link model-qwen.md %})
contains a suitable starting point.

The failure threshold and cooldown configure capability-specific server circuit
breakers. They prevent concurrent callers from repeatedly contacting inference
through a known capability failure without allowing one model or endpoint to
disable unrelated inference work. Queue-full responses remain immediate
endpoint-level load shedding and do not open a circuit. After opening, the
server waits at least the configured cooldown—and honors a longer `Retry-After`
response—before allowing exactly one recovery probe. It does not retry timed-out
or potentially accepted requests.

Enable inference-backed processing separately from the assistant:

```env
INFERENCE_AI_ENABLED=true
INFERENCE_ASSISTANT_ENABLED=false
SKIP_ARTICLE_CLASSIFICATION_ANALYSIS=false
SKIP_ARTICLE_EMBEDDINGS=false
SKIP_SEMANTIC_LABELING=false
```

`INFERENCE_AI_ENABLED=false` prevents every server and worker inference request,
even when feature-specific skip flags are false. Background article analysis and
generated labels also need the AI worker; see [How RSSMonster Works]({% link how-rssmonster-works.md %}).

The server does not configure provider API keys, providers, or model names; it displays
metadata discovered from inference. Embeddings, article
classification, the assistant, Smart Folder recommendations, and feed
rediscovery all call inference. Keep `INFERENCE_ASSISTANT_ENABLED=false` for
local processing without chat. Enable it only after configuring the provider
and credentials described in [Assistant and MCP]({% link assistant.md %}).

## Inference Configuration

Create `inference/.env` from `inference/.env.example`. Common settings are:

```env
INFERENCE_HOST=127.0.0.1
INFERENCE_PORT=3001
INFERENCE_DEBUG=false
EMBEDDING_MAX_BATCH_SIZE=8
EMBEDDING_QUEUE_MAX_PENDING=4
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
EMBEDDING_DIMENSIONS=1024
GENERATION_PROVIDER=local
GENERATION_MODEL=onnx-community/Qwen3.5-0.8B-ONNX
GENERATION_DTYPE=q4
CLASSIFICATION_PROVIDER=local
CLASSIFICATION_MODEL=onnx-community/ModernBERT-base-nli-ONNX
MODERNBERT_DTYPE=q8
MODERNBERT_QUEUE_MAX_PENDING=4
INFERENCE_MODEL_CACHE_DIR=.cache/models
```

This example runs embeddings, generation, and scoring locally without an
OpenAI key. The optional assistant uses a compatible endpoint; configure its
credentials separately using [Assistant and MCP]({% link assistant.md %}).

Set `EMBEDDING_PROVIDER=openai-compatible` or `EMBEDDING_PROVIDER=local`, then add the
provider-specific settings described in the child pages. Independently set
`GENERATION_PROVIDER=openai-compatible` or `GENERATION_PROVIDER=local` for bullet
summaries, tags, Smart Folder recommendations, and feed rediscovery. Assistant
responses are selected independently with `ASSISTANT_PROVIDER=openai-compatible`. Select
advertisement, tone, and quality scoring independently with
`CLASSIFICATION_PROVIDER=openai-compatible` or `CLASSIFICATION_PROVIDER=local`.
The latter downloads `onnx-community/ModernBERT-base-nli-ONNX` into the shared
inference model cache during service startup when it is not already cached.
Every remote capability has independent `*_BASE_URL`, `*_API_KEY`, and `*_MODEL` settings.
See [Inference]({% link inference.md %}#capability-configuration) for mixed endpoints,
workload model overrides, and legacy migration.
Start the service from the `inference` directory:

```bash
npm run dev
```

Development mode logs model loading and readiness plus content-safe activity
for each inference capability. It does not log article bodies, prompts,
generated content, or vectors. Check the active embedding configuration and
loaded state:

```bash
curl http://127.0.0.1:3001/api/embeddings/info
```

## Switching Embedding Models

Different embedding models produce incompatible vector spaces, even when they
describe the same text. Do not combine vectors produced by OpenAI and Qwen in
one RSSMonster database. RSSMonster does not provide a vector migration or
automatically convert existing semantic vectors when the provider changes.
Choose the model before generating vectors for a database, or use a clean
database/vector set when evaluating another model.

The operational rule is: **one database contains vectors from exactly one
embedding model**. Changing `EMBEDDING_PROVIDER` alone is unsafe because new
vectors would be compared with existing vectors from another embedding space.
`npm run reset:semantic` is not a model-switching tool: it removes derived
Events, Topics, and Interest Islands but deliberately preserves article vectors.
Use the guarded model-rebuild command below when changing models in an existing
environment.

Similarity thresholds are model-dependent. Evaluate events, topics, interest
islands, and duplicate detection with RSSMonster's semantic regression report
before adopting a model or changing thresholds.

### Reset and rebuild an existing environment

After selecting the new embedding provider in `inference/.env`, restart the
inference service and inspect the rebuild scope from the server directory:

```bash
npm run semantic:model-rebuild -- --dry-run
```

Review the reported article, vector, event, topic, island, and taxonomy counts.
Then run the destructive rebuild explicitly:

```bash
npm run semantic:model-rebuild -- --confirm
```

The command:

1. Confirms that inference is reachable and reports its embedding model.
2. Clears every article vector and model identifier.
3. Removes events, event and behavioral topics, semantic links, islands,
   duplicate relationships, and derived interest scores.
4. Generates new article vectors only for starred articles
   (`favoriteInd=1`) and articles with at least one click (`clickedAmount>0`).
5. Reloads the shared island taxonomy seed and regenerates all taxonomy vectors.
6. Rebuilds duplicate detection, historical events, event and behavioral
   topics, islands, memberships, and article interest scores.

Feeds, articles, tags, classification results, stars, clicks, and other
engagement signals are preserved. Articles previously marked as semantic
duplicates are restored to `unread` before duplicate detection runs again,
because their earlier read state is not retained separately. Taxonomy rows are
reloaded from the repository seed, so local taxonomy-row edits are replaced.

The command fails unless `--confirm` or `--dry-run` is present. It can be scoped
to one user and use a different batch size:

```bash
npm run semantic:model-rebuild -- --confirm --userId=3 --batchSize=100
```

Taxonomy vectors are shared, so they are regenerated globally even for a
user-scoped rebuild. Stop crawling and semantic jobs for the duration. If a
stage fails, leave crawling stopped, correct the failure, and rerun the same
command; the workflow is repeatable.
