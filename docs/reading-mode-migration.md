# Reading mode contracts

| Display name | Persisted/API value |
| --- | --- |
| Reader | `reader` |
| Expanded | `expanded` |
| Summarized | `summarized` |
| Summary bullets | `summaryBullets` |
| Headlines | `headlines` |

Only these mode values are supported. `PATCH /api/setting/view-mode` persists and
returns the canonical value. Article-list requests reject unsupported modes.
Headlines retains 50-article first-page hydration; other modes retain 20.
Client components, stores, API responses and restored selections no longer translate
retired mode names. The `viewMode` property and database column are unchanged.

Migration `20261012001000-standardize-reading-modes.mjs` upgrades existing preferences
and changes the default to `expanded`, preserving ownership, timestamps, indexes,
foreign keys and SQLite sequence state. It supports retries and schema rollback.
Apply the normal backed-up database upgrade before deploying matching client/server
code. Old clients cannot use retired input values after this release.
