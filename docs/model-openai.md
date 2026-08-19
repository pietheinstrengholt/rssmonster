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
INFERENCE_URL=http://127.0.0.1:3001
INFERENCE_TIMEOUT_MS=30000
```

Configure the provider and credential in the inference service:

```env
# inference/.env
INFERENCE_HOST=127.0.0.1
INFERENCE_PORT=3001
EMBEDDING_PROVIDER=openai
GENERATION_PROVIDER=openai
ARTICLE_SCORING_PROVIDER=openai
ASSISTANT_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
ASSISTANT_MODEL=gpt-4o-mini
OPENAI_MODEL_CRAWL=gpt-4o-mini
OPENAI_MODEL_SMART_FOLDERS=gpt-4.1-mini
OPENAI_MODEL_FEED_REDISCOVERY=gpt-4.1-mini
EMBEDDING_MAX_BATCH_SIZE=8
```

Do not commit either `.env` file. Local models are loaded per capability: for
example, `EMBEDDING_PROVIDER=openai` does not load Qwen3 Embedding, while a
separate `GENERATION_PROVIDER=qwen` would still load Qwen3.5 generation.

The same inference-side credential powers every capability assigned to OpenAI,
including article generation or scoring, the assistant, Smart Folder
recommendations, and feed rediscovery. Never place the OpenAI key in
`server/.env`.

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
