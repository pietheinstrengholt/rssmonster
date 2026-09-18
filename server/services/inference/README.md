# Inference connection

`configuration.js` is the authoritative deployment connection resolver. A nonempty
canonical environment URL (or legacy URL fallback) wins over the singleton database
row; an environment key alone is ignored. No endpoint means no inference.

The shared secret is AES-256-GCM encrypted using an HKDF purpose-specific key from
`FEVER_CREDENTIAL_SECRET`. Back up that secret with the database. Rotating it requires
replacing the saved inference key. Default model serialization excludes ciphertext;
only the resolver reads it. API projections never expose either form of the key.

Each transport request resolves current configuration. Circuits and status snapshots
are scoped by a hash of endpoint and credentials, with no secrets in cache metadata.
Administrative probes use the same transport and contract validators as runtime.

Semantic membership and recommendation confidence belong to the
[domain services](../README.md), not connection resolution. Missing optional
classification/labels must not become invented semantic evidence; unmatched
personalization remains neutral in Recommended scoring.

## Runtime overrides

`runtimeConfiguration.js` owns the nine optional timeout, circuit, permission,
and processing-skip overrides. They are a nullable JSON group on the singleton
`inference_settings.runtimeOverrides` column, separate from the endpoint/key.
The administrator `/api/setting/inference/runtime` GET/PUT/DELETE endpoints expose
and validate this group even when the connection comes from the environment.
Database overrides win over environment values; clearing the group restores
inheritance. `null` permission values mean automatic, suppressing an environment
permission override while still requiring a configured, available capability.
A settings-only row has an empty endpoint and is not an inference connection.
Removing a connection preserves runtime overrides; restoring runtime defaults
preserves the endpoint and encrypted API key.

Runtime consumers resolve these settings from the database in each process.
Crawls, article embedding batches, and processing jobs share one lazy settings
snapshot through AsyncLocalStorage, avoiding a query for every article and never
mutating `process.env`. Subsequent requests/batches read current saved values;
active work retains its snapshot. Explicit injected environments remain available
for isolated tests. Pure `config/intelligentFeatures.js` predicates accept this
resolved environment; callers must resolve it before checking permission.
Transport resolves standard/assistant deadlines per request and replaces cached
circuits when the effective circuit configuration changes. Existing explicit
caller deadlines (including health probes and feed cancellation) remain in force.
