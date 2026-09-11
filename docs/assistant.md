---
layout: page
title: Assistant and MCP
parent: Using RSSMonster
nav_order: 15
---

# Assistant and MCP

The optional assistant helps you explore articles already stored in RSSMonster.
Open chat from the desktop toolbar or mobile Options sheet. Try requests such as
“Find unread security articles from this week” or “Summarize this article.”
Responses depend on available source material and the configured model; follow
article links to check details against the source.

## What the assistant can access

Authenticated tools can search articles, fetch selected article content, list feeds
and categories, find tags, and retrieve favorite, clicked, or hot articles. Search
results are bounded and scoped to your account. Content retrieval works on
explicitly selected articles; it does not read your entire archive in one call.
The assistant also has a crawl tool that can request a feed refresh.

The ordinary search field accepts [search expressions]({% link search.md %}), not arbitrary
natural-language instructions. The assistant translates conversational requests
into tool calls. It cannot retrieve articles that RSSMonster has never collected
just by searching your archive.

## Enable the assistant

Configure model providers using [Model Usage]({% link model-usage.md %}), then enable
chat in `server/.env`:

```env
INFERENCE_AI_ENABLED=true
INFERENCE_ASSISTANT_ENABLED=true
INFERENCE_AGENT_TIMEOUT_MS=300000
# Optional; use a reasoning effort supported by the selected model.
ASSISTANT_REASONING_EFFORT=
```

The assistant uses the `openai-compatible` adapter for OpenAI or OpenAI-compatible gateways,
including local Ollama. Put its credentials and model settings in
`inference/.env`:

```env
ASSISTANT_API_KEY=your-openai-api-key
ASSISTANT_BASE_URL=https://api.openai.com/v1
ASSISTANT_PROVIDER=openai-compatible
ASSISTANT_MODEL=gpt-4o-mini
# Optional gateway endpoint; choose a model available at that endpoint.
# ASSISTANT_BASE_URL=http://127.0.0.1:11434/v1
```

Model calls run through RSSMonster's configured inference provider using Chat
Completions. A gateway does not need Responses API support, but the assistant
model must support tool calling and streaming. For local Ollama, use a non-empty
placeholder key such as `ollama` and an installed model name. See
[the inference gateway guide]({% link inference.md %}#openai-compatible-gateways-and-ollama)
for setup and Compose forwarding requirements. The optional reasoning effort
setting belongs in `server/.env`; leave it blank unless needed by your model.

Local embeddings, classification, summaries, scoring, Smart Folder recommendations,
and feed rediscovery do not require this key when configured with Qwen and
ModernBERT. Chat is an independent optional capability; enabling it does not
schedule background summaries, inferred tags, or article scoring.

For the comprehensive MySQL Compose profile, put the assistant values and
`INFERENCE_ASSISTANT_ENABLED=true` in the repository-root `.env`; that profile
already forwards each value to the responsible service. Recreate it with
`docker compose -f docker-compose.mysql.yml up -d`. For source installations,
restart inference and the server. The client learns chat availability from the
server, so these server-side flags do not require a client rebuild.

Provider credentials belong in inference configuration. RSSMonster executes
user-scoped tools locally; inference performs model calls. When using an external
provider, prompts and the source material included in those requests leave the
RSSMonster host. Embedding and assistant providers can have different settings.

If chat is unavailable, check both enable flags, inference readiness, and provider
configuration. Timeouts and capability circuit breakers are described in
[Configuration]({% link configuration.md %}).

## Integrate using MCP

The Model Context Protocol transport is mounted at `/mcp`, outside `/api`.
It accepts authenticated `GET` and `POST` requests using a JWT bearer token and
exposes the shared RSSMonster tools. Obtain a JWT through `/api/auth/login`
and send it as `Authorization: Bearer <token>`. `/api/agent` is the built-in assistant endpoint;
there is no `/api/mcp` route. MCP authentication and tools do not themselves
require enabling the built-in assistant's model provider.

A compatible integration must support the transport and bearer authentication;
ordinary RSS clients should use [Fever or Google Reader]({% link api.md %}). See
[RSSMonster API]({% link rssmonster-api.md %}) for login and rate limits. The implementation
in `server/controllers/mcp.js` is the reference for tool names and schemas.
