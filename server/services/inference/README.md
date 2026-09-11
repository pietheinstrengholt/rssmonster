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
