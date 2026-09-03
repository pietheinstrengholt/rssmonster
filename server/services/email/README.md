# Email delivery

This directory owns provider-neutral email rendering and the durable delivery outbox.
Producers render and persist a complete message before a worker claims it. Delivery rows are
leased so multiple workers cannot intentionally send the same row concurrently; SMTP remains
an at-least-once protocol, so providers may still accept a message immediately before a process
loses its lease or connection.

Persisted message payloads are internal data and must not be returned through APIs. Recipients,
message bodies, action tokens, and passwords must not be included in logs. Passwords are supplied
only through the central email configuration, and
tests inject a fake transport rather than contacting SMTP servers.

Daily digests use their local calendar date as the deduplication key. Other message types use a
stable request or token identifier. Retryable transport failures use bounded exponential
backoff; permanent failures and exhausted deliveries become terminal.

When email is enabled, `bootstrap.js` starts a bounded delivery runner in the web process. It
verifies the SMTP transport at startup, immediately drains pending work, and polls every five
seconds for new or retryable deliveries. Database leases preserve safe behavior when multiple
web processes run concurrently. Lifecycle logs contain delivery IDs, user IDs, message types,
attempt counts, statuses, and sanitized error codes only.
