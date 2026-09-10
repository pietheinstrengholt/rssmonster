# Authentication

Local and OIDC sign-in share `session.js`, including the existing JWT payload,
expiry, last-login update and email-enrollment response. OIDC never forwards
provider tokens to the browser or uses provider email to find an account.

`oidc.js` uses openid-client for discovery, authorization code exchange, PKCE,
state, nonce, and ID-token validation, including signature verification with
discovered JWKS. Discovery has a ten-second network timeout and a five-minute,
single-provider cache. This cache contains no login transaction state.

Each login has a random state, PKCE verifier, nonce, and separate browser secret.
The browser secret is an HttpOnly, SameSite=Lax cookie; only its hash is stored.
The database stores pending transactions for ten minutes. A conditional update
claims the callback once, removing its verifier and nonce from storage. A valid
callback produces a separate one-minute exchange code, stored as a hash. Its
POST exchange requires the original cookie and configured origin, and deletes
the transaction atomically before issuing an application session. Expired
transactions are removed in batches of up to 100 when a new attempt starts.
All instances must share the database, JWT secret and OIDC configuration.

Identity hashes use the exact JSON-encoded issuer/subject pair, so MySQL's
case-insensitive text collation cannot merge distinct subjects. Stored issuer
and subject values are checked again on lookup. An identity can belong to only
one user. Linking requires an authenticated application session and the current
local password, and rechecks the password version at callback time. Password
changes also invalidate pending exchanges. Provider emails do not alter linked local accounts, and provider roles never
alter account roles. Linking does not promote anyone to administrator.

`identities.js` resolves previously linked users and optionally creates OIDC-only
users and identities in one transaction. A unique-constraint race is recovered
only by finding the exact identity; email conflicts never merge accounts. New
users always have role `user`, no bootstrap-admin claim, and null local password
and Fever credentials. Only verified provider email is saved at creation. Later logins synchronize verified
email for passwordless accounts under a user-row lock, invalidate old verification
tokens, and reject unique-email conflicts without merging. Local accounts retain
their recovery address. Recovery and password-update paths
must reject users without a local password or when local authentication is
disabled. The global policy also blocks local entry routes, development login,
Fever/Google Reader credentials, and password-confirmed linking (including
pending callbacks and exchanges). Existing application sessions retain their
normal expiry and password-version checks. Account deletion
cascades to identities and pending transactions. Browser logout uses the normal
RSSMonster session cleanup; provider-wide logout and immediate revocation after
provider account suspension are not implemented.

Optional email-domain and group allowlists are checked against validated ID-token
claims before any identity lookup, linking, or provisioning. Both configured
restrictions must pass. Email domains require boolean verification and exact
case-insensitive domain equality; groups require an array of strings and one
exact case-sensitive match in a literal top-level claim. No roles are derived
from these claims. The access policy is part of the transaction configuration
hash, so changing it invalidates pending callbacks and handoffs. Established
application sessions are not revalidated against provider claims.

`OIDC_FRONTEND_URL` separates the final browser destination from the provider
callback URI. It defaults to the callback origin and permits another port on the
same scheme/hostname. Only that frontend origin receives credentialed OIDC CORS
responses and may POST linking or exchange requests. The client includes browser
credentials for these two requests only. SameSite=Lax and HttpOnly protection
remain in place, and the frontend URL participates in the transaction configuration
hash so changes invalidate pending flows.
