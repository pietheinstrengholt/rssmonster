# Server AI capabilities

The server uses one provider: the RSSMonster inference HTTP service. Model names,
provider selection, compatible endpoint URLs, and provider credentials belong
exclusively to the standalone `inference/` project.

```text
Controllers / domain services / workers
                  |
       AI capability contracts
                  |
     providers/inference.js (routes)
                  |
  inferenceClient.js (resilient transport)
                  |
   RSSMonster inference HTTP service
                  |
        Model implementation
```

## Public operations

Import a capability directly, or use the lightweight default registry in
`registry.js`. Tests can call `createAI({ inference: fakeProvider, environment })`
or a capability factory with a fake provider; no HTTP or database is required.
There is no dynamic provider registration or generic prompt API.

| Capability | Operations | Responsibility |
| --- | --- | --- |
| Embedding | `embedTexts(texts, options)`, `getEmbeddingInfo(options)` | Validate non-empty text batches, model metadata, vector counts/dimensions, and finite vector elements. Return the inference envelope unchanged. `embed` aliases `embedTexts` on the registry. |
| Generation | `generateSmartFolderRecommendations({ insights }, options)`, `rediscoverFeed(input, options)`, `generateSemanticLabels(input, options)` | Preserve each workload's existing request and response contract. Empty recommendations, `url:null`, and null labels are valid results. |
| Classification | `classifyArticle(input, options)` | Validate the combined article analysis response: separate summary bullets, tags, advertisement, sentiment, and quality scores. The HTTP API has no separate scoring-only endpoint. |
| Assistant | `chat(request, options)`, `stream(request, options)` | Preserve the Agents SDK model envelope and NDJSON event objects. Carry cancellation outside serialized payloads. |

Options carry the existing request ID, caller signal, timeout, and transport test
injection through to the provider. Capability validators never quote input or
response content in errors. Transport failures retain their identity, categorical
codes, request metadata, and retry information. `errors.js` exposes the shared
safe diagnostics without requiring domain code to import the transport.

## Domain responsibilities remain outside this layer

- `embeddings/embeddingService.js` remains a compatibility entry point for article,
  semantic, and administrative consumers. `articles/embedArticle.js` still owns
  text preparation, eligibility, and persistence. New model metadata always comes
  from inference; `legacyEmbeddingMetadata.js` only identifies historical vectors
  whose metadata was absent.
- Article enrichment retains feature skips, local default analysis, action-owned
  score overrides, and queue-full fallback. Durable jobs retain their retry policy;
  malformed classification results remain non-retryable at the job boundary.
- Semantic labeling retains bounded title selection, user ownership, normalization,
  deterministic fallback labels, and presentation-only writes.
- Smart Folder and feed services retain meaningful named operations. Controller
  insights map to the existing `{ insights }` contract.
- The agent model provider only adapts the assistant capability to the Agents SDK.
  The SDK is used for orchestration and server-owned tools, not direct vendor calls.

## Availability and health

`getAIPermissions(environment)` reports configured permissions. Generic embeddings
and generation follow `INFERENCE_AI_ENABLED`; article classification also follows
its classification skip flag, and assistant permission requires the independent
assistant flag. `getAIOperations` reports article embedding/classification and
semantic-label skips. An article embedding skip does not disable taxonomy or
administrative embedding operations. Existing domain checks and route middleware
remain authoritative; the transport still fails closed when inference is disabled.

`getInferenceCapabilities(options)` (also registry `getCapabilities`) retrieves and
validates the version 1 discovery contract. Unknown additive fields are discarded;
malformed and unsupported contracts produce safe categorical errors. It never uses
server provider/model settings. Registry `getPermissions` remains a separate local
permission check.

`getAIHealth(options)` composes `/health`, `/ready`, and `/api/capabilities` with
a 3-second default timeout. It returns:

- `enabled`: whether inference calls are configured;
- `reachable`: whether either check received an HTTP response, false on failed
  connection attempts, or null when disabled or both probes were circuit-blocked;
- `ready`: successful readiness response with `state:ready` and `acceptingWork:true`;
- `state`: allowlisted lifecycle state or `unknown`;
- `configured`: server capability permissions;
- `capabilities`: remote discovery availability restricted by server permissions and
  observed readiness. Discovery failure leaves these false.

Disabled inference makes no health requests. A liveness response alone never
establishes model readiness. Inference is authoritative for remote capability availability. Discovery is cheap
and descriptive, and does not prove external endpoint health. The administrator Inference Settings section consumes the connection status service;
provider/model configuration remains owned by inference. See `docs/inference.md` for the
versioned wire schema and lifecycle semantics.

The existing service-health API maps this snapshot to its unchanged presentation
contract. Health/readiness/discovery probes use separate transport circuit keys, so their
failures do not open work circuits.

## Reliability

`inferenceClient` continues to own fetch, base URL, JSON serialization, request IDs,
timeouts, caller cancellation, safe errors, and circuit breakers. All established
work circuit keys are retained: `embeddings`, `classification`, `assistant`,
`smart-folders`, `feed-rediscovery`, and `semantic-labels`. Generation operations
remain isolated from each other. Queue-full responses keep `Retry-After` metadata
without opening a work circuit; readiness failures still qualify. No automatic
retry is added.

Streaming fetch and NDJSON decoding moved from the agent bridge into the transport.
Streaming retains its existing behavior outside the non-streaming assistant
circuit. It carries request IDs, composes timeout and caller cancellation, and
cancels/releases the HTTP reader if the consumer ends iteration early. Domain
capabilities validate event envelopes without changing their SDK contents.

Tests in `tests/ai/` exercise injected capability contracts, endpoint mapping,
configuration/health, and the full capability-to-transport boundary. Existing
inference circuit, embedding, agent, domain, and job tests remain regression checks.

## Optional inference authentication

The server transport uses `INFERENCE_BASE_URL` (`INFERENCE_URL` remains a fallback)
and sends `X-Inference-API-Key` when `INFERENCE_API_KEY` is nonempty. Configure the
exact same opaque shared secret on server/workers and inference. With no inference
key, authentication is disabled. `/health` remains public; `/ready` and all API
routes are protected when enabled. HTTP 401 maps to `INFERENCE_UNAUTHORIZED` and
does not open transient failure circuits. Keys stay out of metadata and logs.
See the inference documentation for generation, HTTPS, and deployment examples.

Connection persistence and precedence now live in `../inference/configuration.js`.
Transport reads current settings per request. Discovery/status UI uses the 15-second
connection-scoped cache in `../inference/status.js`; domain skip flags remain permission
overrides, and missing connections stop scheduling and dispatch.
