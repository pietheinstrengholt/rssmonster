# Tone score contract migration

Tone measures emotional neutrality and balance. A higher score indicates calmer,
more factual language; it does not mean more positive news. The scoring behavior,
component weights, bucket values, defaults, analysis status exemptions and
threshold comparisons are unchanged.

| Previous contract | Canonical contract | Location |
| --- | --- | --- |
| `sentimentScore` | `toneScore` | Article source, model, API and inference result |
| `minSentimentScore` | `minToneScore` | Settings, article-list query and matching mark-read body |
| `articles.sentimentScore` | `articles.toneScore` | Database column |
| `user_settings.minSentimentScore` | `user_settings.minToneScore` | Persisted threshold |
| `setMinSentimentScore`, `getSentimentClass` | `setMinToneScore`, `getToneClass` | Client store and presentation helper |
| `--sentiment-score-*`, sentiment component classes | `--tone-score-*`, tone component classes | Theme and component styles |

## Compatibility

The server accepts the old minimum property on `/api/setting`, `/api/articles`
and `/api/articles/markasread`. JSON responses include the old score and threshold
properties alongside the canonical ones. When both input names are present, the
canonical property wins, including zero. Clients normalize old responses and
restored settings to canonical properties.

Inference prompts and providers use `toneScore`. The inference HTTP response also
includes `sentimentScore`, and the server accepts either inference result. Thus
inference and server may upgrade in either order. Legacy model JSON is accepted
without changing score bucketing. Internal state uses only the canonical name. Signed pagination cursors retain their
legacy wire key so an in-progress list can continue across the server upgrade.

There is no separate sentiment or Tone search operator. Existing `quality`
expressions, sorting, saved folders and generated feeds retain their behavior.
Overall quality still weights Writing quality at 50%, Tone at 25%, and Ad-free
content at 25%.

IndexedDB version 4 converts stored article DTOs to `toneScore`. Existing account
profiles, active generations and pending action receipt IDs, sequences and retry
state survive the upgrade. The version-2 saved/opened-original migration remains
supported. No article reanalysis, semantic rebuild or data backfill is needed.

## Upgrade and rollback

1. Back up the database. Stop the old server and workers before changing its
   schema; old processes use the previous physical columns.
2. Deploy the matching server and client release, then run the normal migrations
   from `server/` with `npm run db` against the intended deployment database.
3. Restart the new server and workers. Reload browser clients; close old tabs if
   they block the IndexedDB version change. The new server continues to accept
   legacy clients through the aliases above.

The new client and server belong to the same release: an old server does not
understand the new minimum property sent by the client. Database migration
`20261012002000-standardize-tone-score.mjs` renames columns without rewriting
scores, thresholds or timestamps. It retains existing indexes and references.
Retries tolerate columns that are already renamed; simultaneous old and new
columns cause an explicit failure rather than choosing one value.

The migration exports a `down` function that restores the previous column names
and retains values; it is tested on MySQL and SQLite. The normal `npm run db`
runner only applies pending migrations, and Sequelize CLI does not discover
`.mjs` migrations. For rollback, stop the new server and workers and use an
ESM-aware migration runner to execute this migration's `down` and remove its
`SequelizeMeta` entry, or restore the pre-upgrade backup, before restoring the
old server/client release. Other migrations have their own rollback requirements.
Browser database version 4 stays canonical, so an older client that only reads
`sentimentScore` needs a fresh offline download after rollback. Retain pending
actions until they have synchronized; do not clear browser storage to downgrade.
