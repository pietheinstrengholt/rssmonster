# Interest API

All endpoints require the existing Bearer session authentication. Reads return the
current user's persisted Islands without calibration, scoring, or writes.

`GET /api/interests` returns `{ interests: [...], summary: {...} }`.
`GET /api/interests/:id` returns `{ interest: {..., representativeArticles: [...] } }`.
Malformed unsigned BIGINT IDs return 400; missing and foreign Islands return 404.

Each interest contains:

```json
{
  "id": 1,
  "name": "Space exploration",
  "polarity": "positive",
  "weight": 0.5,
  "evidenceStrength": 50,
  "lastActivityAt": "2026-09-25T08:00:00.000Z",
  "lifecycle": "active",
  "muted": false,
  "evidence": { "favorites": 2, "clicks": 4, "deepReads": 1 }
}
```

- `name` prefers a nonblank trimmed `generatedLabel`, otherwise `label`.
- `weight` is the persisted signed preference. Calibration uses
  `clamp(averageArticleSignalScore / 7 + sign(averageArticleSignalScore) * min(0.2, articleCount * 0.03), -1, 1)`.
  Positive means interest, negative means aversion, and zero means neutral.
- `evidenceStrength` is `100 * min(1, abs(weight))`, rounded to two decimals.
  This is normalized preference magnitude, **not** evidence confidence, match
  probability, or effective recommendation contribution. Archived preferences
  retain their historical weight. Scoring separately applies Island confidence,
  relationship confidence, eligibility and signed contribution selection.
- `lastActivityAt` is `lastBehaviorAt`, nullable; technical timestamps are never substituted.
- `lifecycle` follows the existing Settings overview and `isActiveIsland`:
  active only when unarchived with a usable activity clock and an unexpired
  deadline. The deadline is `lastBehaviorAt + ISLAND_INACTIVITY_DAYS` (default 90,
  configured between 30 and 90). All other rows are presented as archived,
  including expired rows awaiting an archival write and unknown/future clocks.
  Dormant has no separate current-state classifier. Reactivation is a historical
  transition, not a persistent current state. Neither is exposed or filterable.
- `muted` is independent of lifecycle and defaults to false. Muted Islands remain
  visible with their weight, vector and evidence but are excluded from future
  Island-based interest scoring. Unmuting restores participation in subsequent
  scoring; neither action changes previously stored Article scores.
- Positive/neutral `evidence` maps the persisted snapshot's `stars`, `clicks`,
  and `deepReads` directly. These are calibration snapshot counters, not live
  counts or a reconstruction of all Article history.
- Despite its name, calibration also persists `positiveSignals.negatives`.
  Negative Islands expose `evidence: { negativeFeedback: <negatives> }` only
  when that field exists. Older snapshots may omit it; then `evidence` is omitted.
  Missing counts are not reconstructed or invented. Skips, hides and negative
  reads have no supported breakdown.

List query parameters:

| Parameter | Accepted values / behavior |
| --- | --- |
| `polarity` | `all` (default), `positive`, `negative` |
| `lifecycle` | `all` (default), `active`, `archived` |
| `sort` | `strength` (default, descending absolute weight), `recent` (descending activity, null last), `name` (display name alphabetically) |
| `search` | Case-insensitive literal substring of either label; surrounding whitespace ignored |

Invalid supported parameter values return 400. Ties preserve ascending Island ID.
`summary` describes the complete owned collection **before** filters/search:
`{ total, positive, negative, neutral, active, archived }`. Dormant is omitted
rather than reported as a fabricated zero. Neutral ensures polarity counts sum
to total. One lightweight, user-scoped query loads all owned Islands, including
archived history; the active capacity limit is not a limit on that history.

The detail endpoint reads at most the existing 64 validated support ID hints in
one Article query, rechecks Article and Feed ownership and canonical/unfiltered
visibility, then returns the first three surviving Articles in support order.
Calibration orders that snapshot by qualifying interaction recency, then ID.
Missing or empty support returns an empty array. Each Article exposes only
`{ id, title, imageUrl, publishedAt, feed: { id, feedName } }`.
These are representative support references, not a new semantic membership claim.
No vector searches or Event evidence are used. Vectors, model identifiers,
Article bodies, support IDs and raw population audits are never selected for
presentation. List reads do not load Articles.

`PATCH /api/interests/:id` accepts `{ "muted": true }` or `{ "muted": false }`
and returns `{ interest: {...} }` with the updated state. It updates only the
authenticated user's Island. Malformed IDs or non-boolean values return 400;
missing and foreign Islands return 404. The mutation does not recalibrate Islands
or retrospectively update stored Article scores.
