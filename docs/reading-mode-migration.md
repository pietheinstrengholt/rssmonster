# Reading-mode contract migration

Canonical UI labels and values:

| Label | Value | Accepted legacy value |
| --- | --- | --- |
| Reader | `reader` | — |
| Expanded | `expanded` | `full` |
| Summarized | `summarized` | — |
| Summary bullets | `summaryBullets` | — |
| Headlines | `headlines` | `minimal` |

`PATCH /api/setting/view-mode` accepts canonical and legacy values, persists the
canonical value, and returns it in `viewMode`. `GET /api/setting` returns canonical
values even before existing preferences have been migrated. Article-list requests
accept both vocabularies; Headlines and legacy `minimal` retain 50-article
first-page hydration, while the other modes retain 20.

Client JSON-response and selection boundaries normalize legacy values, including
restored settings. New client requests use canonical values. Component
props, events, methods, and mode-specific CSS use Headlines terminology.
`viewMode` remains the property and database column name; no route is renamed.

The migration `20261012001000-standardize-reading-modes.mjs` changes the database
default to `expanded` and rewrites only `full` and `minimal` in
`user_settings.viewMode`. Other preferences, ownership, timestamps, indexes, and
foreign keys are preserved. SQLite rebuilds the table while retaining its schema
objects and auto-increment sequence. The migration can be retried, and its `down`
restores legacy values and the legacy default.

Deploy the matching client and server together: accepted input aliases do not
make an old client understand canonical values returned by the upgraded API.
Use the normal documented database-upgrade workflow after backing up the database.
This change does not alter mode availability, Reader expansion, content rendering,
reading-time behavior, or the separate Summarized/AI-description glossary issue.
