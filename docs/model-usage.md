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

- [OpenAI](model-openai.md), using `text-embedding-3-small` by default.
- [Qwen](model-qwen.md), running `onnx-community/Qwen3-Embedding-0.6B-ONNX`
  locally with Transformers.js.
- Qwen3.5 generation, running `onnx-community/Qwen3.5-0.8B-ONNX` locally.
- ModernBERT article scoring, running
  `onnx-community/ModernBERT-base-nli-ONNX` locally.

## Server Configuration

For a manual installation, add the inference connection to `server/.env`:

```env
INFERENCE_URL=http://127.0.0.1:3001
INFERENCE_TIMEOUT_MS=30000
```

`INFERENCE_URL` is the base URL of the inference service. Use a private service
name instead of `127.0.0.1` when the processes run in separate containers.
`INFERENCE_TIMEOUT_MS` applies to non-agent inference requests. Local model startup
and CPU inference can need a longer timeout; the [Qwen guide](model-qwen.md)
contains a suitable starting point.

Enable the AI interface exposed to the client and allow longer streamed agent
requests with:

```env
INFERENCE_AI_ENABLED=true
INFERENCE_AGENT_TIMEOUT_MS=300000
```

The server contains no OpenAI key or model configuration. Embeddings, article
classification, the assistant, Smart Folder recommendations, and feed
rediscovery all call the inference service.

## Inference Configuration

Create `inference/.env` from `inference/.env.example`. Common settings are:

```env
INFERENCE_HOST=127.0.0.1
INFERENCE_PORT=3001
INFERENCE_DEBUG=false
EMBEDDING_MAX_BATCH_SIZE=8
EMBEDDING_PROVIDER=qwen
EMBEDDING_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
EMBEDDING_DIMENSIONS=1024
GENERATION_PROVIDER=qwen
GENERATION_MODEL=onnx-community/Qwen3.5-0.8B-ONNX
GENERATION_DTYPE=q4
ARTICLE_SCORING_PROVIDER=modernbert
MODERNBERT_MODEL=onnx-community/ModernBERT-base-nli-ONNX
MODERNBERT_DTYPE=q8
OPENAI_API_KEY=your-openai-api-key
ASSISTANT_PROVIDER=openai
ASSISTANT_MODEL=gpt-4o-mini
```

Set `EMBEDDING_PROVIDER=openai` or `EMBEDDING_PROVIDER=qwen`, then add the
provider-specific settings described in the child pages. Independently set
`GENERATION_PROVIDER=openai` or `GENERATION_PROVIDER=qwen` for bullet
summaries, tags, Smart Folder recommendations, and feed rediscovery. Assistant
responses are selected independently with `ASSISTANT_PROVIDER=openai`. Select
advertisement, tone, and quality scoring independently with
`ARTICLE_SCORING_PROVIDER=openai` or `ARTICLE_SCORING_PROVIDER=modernbert`.
The latter downloads `onnx-community/ModernBERT-base-nli-ONNX` into the shared
inference model cache during service startup when it is not already cached.
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
RSSMonster currently has no supported in-place command that clears and
re-embeds every retained article. For a model change, use a clean database or a
separately isolated vector data set, then regenerate taxonomy vectors and all
derived semantic state with the selected model before crawling resumes.

Similarity thresholds are model-dependent. Evaluate events, topics, interest
islands, and duplicate detection with RSSMonster's semantic regression report
before adopting a model or changing thresholds.
