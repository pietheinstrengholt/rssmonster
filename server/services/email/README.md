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

`bootstrap.js` starts a bounded delivery runner in the web process, including when
email is disabled so that later UI changes can enable delivery. It
verifies the SMTP transport at startup, immediately drains pending work, and polls every five
minutes for new or retryable deliveries. Database leases preserve safe behavior when multiple
web processes run concurrently. Lifecycle logs contain delivery IDs, user IDs, message types,
attempt counts, statuses, and sanitized error codes only.

Passwordless OIDC accounts have provider-managed email. Account/admin email writes
are rejected unless the normalized address is unchanged. The enrollment endpoint
may set an address only while it is unverified, checked under the user-row lock.
Validated provider claims may synchronize and verify an address at login through
the same email-change transaction; old verification tokens are invalidated.


`configuration.js` merges the allowlisted database overrides over the environment
and reuses the pure parser in `config/email.js`. HTTP flows resolve on each operation;
delivery workers resolve once per batch and close that batch's transport afterwards.
The daily briefing scheduler resolves once per default producer batch. Avoid cached
process-local configuration: settings must also apply across multiple web processes.
The synchronous `createMailService` factory accepts a configuration snapshot for
one operation/batch; runtime callers supply the resolved configuration explicitly.

SMTP settings live under `emailConfiguration` in `server_settings`. Saves lock that
row so keeping a password cannot overwrite a concurrent password change. Passwords
are encrypted with the shared `secretEncryption.js` helper and `ENCRYPTION_KEY`;
metadata only reports presence/source, and persistence queries disable SQL logging. No API may return the raw settings row. Password-file
contents are read only at the configuration boundary and are never returned.

The SMTP form uses one group override controlled by `EMAIL_ENABLED`. Saves require
all non-secret SMTP fields when that override is present; an empty override map
restores the entire environment configuration, including any saved password.
Existing individual overrides remain effective and are shown as a managed group;
the next UI save writes the full group. Managed groups never inherit environment
passwords and always ignore password files, including previously saved file paths.
Password files remain supported for environment-only configuration. The form uses
one masked password input: unchanged retains only a saved database password,
editing replaces or clears it. Restoring the environment password requires
restoring the whole group.

Only `SMTP_PASSWORD` is encrypted in this group. Runtime resolution decrypts it
only when email is enabled; metadata and enabled checks do not decrypt it. Legacy
plaintext is accepted at runtime and encrypted on the next settings save. A failed
encryption leaves the previous row unchanged. Environment values bypass encryption.
See [key setup and migration](../../../docs/configuration.md#encryption-of-sensitive-server-settings).
