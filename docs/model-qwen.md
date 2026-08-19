---
layout: page
title: Qwen
parent: Model Usage
nav_order: 2
---

# Qwen Embeddings

RSSMonster can run `onnx-community/Qwen3-Embedding-0.6B-ONNX` locally through
Transformers.js. It uses CPU inference, last-token pooling, L2 normalization,
and the model's native 1024-dimensional vectors. One model instance is loaded
during service startup and reused, and inference requests are serialized in-process.

## Configuration

Configure the RSSMonster server to reach inference. A longer timeout is useful
on low-power hardware and during the first model load:

```env
# server/.env
INFERENCE_URL=http://127.0.0.1:3001
INFERENCE_TIMEOUT_MS=600000
```

Configure Qwen in the inference service:

```env
# inference/.env
INFERENCE_HOST=127.0.0.1
INFERENCE_PORT=3001
INFERENCE_DEBUG=false
INFERENCE_MODEL_CACHE_DIR=.cache/models
EMBEDDING_PROVIDER=qwen
GENERATION_PROVIDER=qwen
GENERATION_MODEL=onnx-community/Qwen3.5-0.8B-ONNX
GENERATION_DTYPE=q4
ASSISTANT_PROVIDER=openai
ASSISTANT_MODEL=gpt-4o-mini
ARTICLE_SCORING_PROVIDER=openai
EMBEDDING_MODEL=onnx-community/Qwen3-Embedding-0.6B-ONNX
EMBEDDING_DIMENSIONS=1024
EMBEDDING_MAX_BATCH_SIZE=8
```

Qwen can provide embeddings separately from Qwen3.5 generation. With the
configuration above, Qwen3.5 generates article summaries, tags, Smart Folder
recommendations, and feed rediscovery results. The assistant remains on OpenAI
and therefore still requires `OPENAI_API_KEY`; the server never needs that
credential.

Transformers.js downloads missing model assets while the inference service
starts and stores them under `inference/.cache/models` by default. Relative cache
paths are resolved from the `inference` project directory. Cached model files
are not committed to Git and are reused after restarts. Deleting the cache
causes the model to be downloaded again on its next use.

The service begins listening only after every configured local model is loaded. With
`INFERENCE_DEBUG=true` (automatically enabled by `npm run dev`), the console
reports `loaded:true`, readiness for crawling, and content-safe request and
completion messages for embedding, generation, and other inference capabilities.

## Observed Semantic Behavior

In RSSMonster's 686-article semantic regression fixture, Qwen passed all 12
pipeline tests. Compared with OpenAI `text-embedding-3-small`, it grouped more
articles into events and topics and separated two unrelated transport
accidents that OpenAI placed in one topic. It also formed more complete groups
for several news stories.

Qwen was more aggressive when assigning content through interest-island
fallback paths, including some broad or questionable assignments, and it
split a few article sets that OpenAI grouped together. Duplicate detection was
the same for both models. This suggests stronger event/topic recall in the
current fixture, with a greater need to calibrate island behavior. The outcome
depends on the articles, prompts, and similarity thresholds and should not be
treated as a universal ranking of the models.

Qwen keeps embedding content and inference on the host and avoids per-request
API charges. In exchange, the host must store the model and provide sufficient
memory and CPU time. Its vectors cannot be mixed with OpenAI vectors.
