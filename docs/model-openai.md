---
layout: page
title: OpenAI
parent: Model Usage
nav_order: 1
---

# OpenAI Embeddings

OpenAI is the default embedding provider. RSSMonster uses
`text-embedding-3-small` with 1536 dimensions unless it is configured
otherwise. Embedding requests still pass through the local inference service;
only that service contacts OpenAI.

## Configuration

Configure the RSSMonster server to reach inference:

```env
# server/.env
INFERENCE_BASE_URL=http://127.0.0.1:3001
INFERENCE_TIMEOUT_MS=30000
# Optional assistant reasoning override; use only a value supported by the model.
ASSISTANT_REASONING_EFFORT=
```

Configure each remote capability in `inference/.env`:

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

OpenAI uses the generic `openai-compatible` adapter. Each capability can instead
use a different compatible endpoint and credential. Remote classification uses
the existing LLM scoring flow. The assistant uses Chat Completions through the
Agents SDK and requires tool calling and streaming support. No local model is
loaded for a capability selected as external.

`GENERATION_MODEL` defaults all generated text workloads to one model; optional
`GENERATION_ARTICLE_MODEL`, `GENERATION_SMART_FOLDER_MODEL`, and
`GENERATION_FEED_REDISCOVERY_MODEL` override it. Set
`OPENAI_OMIT_TEMPERATURE=true` when the endpoint rejects explicit temperature.
Assistant reasoning is optional and belongs in `server/.env`.

See [Inference]({% link inference.md %}#capability-configuration) for mixed
endpoint examples, container networking, configuration validation, and legacy
migration. Keep credentials exclusively in inference. Existing `openai`
provider names and `OPENAI_*` model/connection settings remain deprecated
aliases for one release; migrate providers and model settings together.

## Observed Semantic Behavior

In RSSMonster's 686-article semantic regression fixture, OpenAI passed the same
12 pipeline tests as Qwen. It generally produced more conservative event and
topic grouping and fewer interest-island fallback assignments. Duplicate
detection produced the same result with both models.

The report also showed trade-offs: OpenAI kept some related articles out of
otherwise coherent events, and one topic incorrectly joined two unrelated
public-transport accidents. It grouped some Windows and game-related article
sets more completely than Qwen. These are observations from one RSSMonster
fixture, not general guarantees about the model.

OpenAI avoids the local model download and CPU/memory cost, but embedding
content is sent to an external API and incurs API usage. Its vector space is
not compatible with Qwen vectors.
