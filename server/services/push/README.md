# Web Push

`configuration.js` resolves the optional environment configuration or the complete
`pushConfiguration` override in `server_settings`. Administrator-only settings
routes return metadata for keys. Saves lock the aggregate row, retain unchanged
keys, validate a matching P-256 key pair and contact subject, then encrypt both
VAPID keys using `secretEncryption.js` and `ENCRYPTION_KEY`. The subject remains
plaintext. SQL logging is disabled for settings reads/writes. No migration is
required, and environment credentials bypass encryption.

Metadata remains readable without the encryption key so administrators can
replace or remove overrides. Empty key pairs disable push and must not inherit
environment keys. Restoring defaults removes the complete group. Runtime reads
decrypt only a complete configuration; browser subscription configuration decrypts
only the public key. The authenticated subscription endpoint must expose the
public key to browsers, but never the private key or ciphertext.

`pushNotifications.js` resolves configuration per delivery batch, scopes
subscriptions and visible unread counts to the user, and supplies VAPID details
per send rather than mutating web-push's global configuration. Preserve delivery
deadlines, socket cleanup, and removal of expired subscriptions. Replacing VAPID
keys does not rewrite existing browser subscriptions; readers may need to
unsubscribe and subscribe again. Tests mock delivery rather than contacting push
services.
