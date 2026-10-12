# Tone score contract migration

Tone measures emotional neutrality and balance. A higher score indicates calmer,
more factual language; it does not mean more positive news. The scoring behavior,
component weights, bucket values, defaults, analysis status exemptions and
threshold comparisons are unchanged.

| Canonical contract | Location |
| --- | --- |
| `toneScore` | Article source, model, API and inference result |
| `minToneScore` | Settings, article-list query and matching mark-read body |
| `articles.toneScore` | Database column |
| `user_settings.minToneScore` | Persisted threshold |
| `setMinToneScore`, `getToneClass` | Client store and presentation helper |
| Tone component classes and tokens | Theme and component styles |

## Canonical contracts only

Runtime requests, responses, inference results and restored selections use only
`toneScore` and `minToneScore`. Duplicate response aliases and model-output aliases
are removed. The server requires canonical inference scores; deploy matching
client, server and inference versions together. Signed pagination cursors must
restart after this release because threshold fingerprints use canonical names.

There is no separate Tone search operator. Existing `quality` expressions,
sorting, saved folders and generated feeds retain their behavior. Overall quality
still weights Writing quality at 50%, Tone at 25%, and Ad-free content at 25%.

IndexedDB version 4 converts existing cached Article records once. Profiles,
generations and action receipt IDs, sequences and retry state survive. This
historical conversion is separate from runtime API/state handling. No article
reanalysis or semantic rebuild is required.

## Upgrade and rollback

1. Back up the database. Stop the old server and workers before changing its
   schema; old processes use the previous physical columns.
2. Deploy the matching server and client release, then run the normal migrations
   from `server/` with `npm run db` against the intended deployment database.
3. Restart the new server and workers. Reload browser clients; close old tabs if
   they block the IndexedDB version change. All clients and inference instances
   must use the canonical contracts.

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
Browser database version 4 stays canonical; older clients need a fresh offline
download after rollback. Retain pending actions until they have synchronized; do not clear browser storage to downgrade.
